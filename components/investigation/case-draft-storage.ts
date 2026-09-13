import {
  ACTIVE_CASE_STORAGE_KEY,
  type CfdiAnalysisResult,
  type DetectedCompany,
  type InvestigationCaseDraft,
  type InvestigationSummary,
  type ParsedCfdi,
  type UploadedXmlFile,
} from "./cfdi-types";

function getDateSegment(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredCaseDraft(value: unknown): value is InvestigationCaseDraft {
  return (
    isRecord(value) &&
    typeof value.caseId === "string" &&
    typeof value.createdAt === "string" &&
    value.status === "investigating" &&
    (value.analysisSource === "python" || value.analysisSource === "browser-fallback") &&
    Array.isArray(value.sourceFiles) &&
    Array.isArray(value.invoices) &&
    Array.isArray(value.entities) &&
    Array.isArray(value.relationships) &&
    (value.financialTransactions === undefined || Array.isArray(value.financialTransactions)) &&
    Array.isArray(value.evidence) &&
    Array.isArray(value.signals) &&
    isRecord(value.metrics) &&
    isRecord(value.summary) &&
    isRecord(value.totalAmountByCurrency) &&
    Array.isArray(value.detectedCompanies),
  );
}

function getPartyCompanies(invoice: ParsedCfdi): DetectedCompany[] {
  return [invoice.issuer, invoice.receiver]
    .filter((party): party is DetectedCompany => Boolean(party.rfc))
    .map((party) => ({ rfc: party.rfc.toUpperCase(), name: party.name }));
}

export function getInvestigationSummary(sourceFiles: UploadedXmlFile[]): InvestigationSummary {
  const invoices = sourceFiles.flatMap((file) => (file.status === "parsed" && file.parsed ? [file.parsed] : []));
  const companyByRfc = new Map<string, DetectedCompany>();

  for (const invoice of invoices) {
    for (const company of getPartyCompanies(invoice)) {
      const currentCompany = companyByRfc.get(company.rfc);
      if (!currentCompany || (!currentCompany.name && company.name)) {
        companyByRfc.set(company.rfc, company);
      }
    }
  }

  const currencies = Array.from(new Set(invoices.flatMap((invoice) => (invoice.currency ? [invoice.currency] : []))));

  return {
    invoiceCount: invoices.length,
    totalAmount: invoices.reduce((total, invoice) => total + (invoice.total ?? 0), 0),
    detectedCompanies: Array.from(companyByRfc.values()),
    currency: currencies.length === 1 ? currencies[0] : undefined,
    hasMixedCurrencies: currencies.length > 1,
  };
}

export function createTemporaryCaseDraft(sourceFiles: UploadedXmlFile[], analysis: CfdiAnalysisResult): InvestigationCaseDraft {
  const date = new Date();
  const createdAt = date.toISOString();
  const randomSegment = Math.floor(1000 + Math.random() * 9000);
  const totalAmountEntries = Object.entries(analysis.metrics.totalAmountByCurrency);
  const detectedCompanies = analysis.entities.map((entity) => ({ rfc: entity.rfc, name: entity.name }));

  return {
    caseId: `CASE-${getDateSegment(date)}-${randomSegment}`,
    createdAt,
    status: "investigating",
    analysisSource: analysis.analysisSource,
    sourceFiles,
    invoices: analysis.invoices,
    entities: analysis.entities,
    relationships: analysis.relationships,
    financialTransactions: [],
    evidence: analysis.evidence.map((evidence) => ({
      ...evidence,
      createdAt,
      description: evidence.fact,
      whatItProves: evidence.fact,
      whatItDoesNotProve: "Una factura registra información de facturación; no demuestra por sí sola una transferencia financiera o fraude.",
      confidence: 1,
    })),
    signals: analysis.signals,
    metrics: analysis.metrics,
    summary: analysis.summary,
    totalAmount: totalAmountEntries.length === 1 ? totalAmountEntries[0][1] : undefined,
    totalAmountByCurrency: analysis.metrics.totalAmountByCurrency,
    detectedCompanies,
  };
}

export function saveActiveCaseDraft(draft: InvestigationCaseDraft): void {
  sessionStorage.setItem(ACTIVE_CASE_STORAGE_KEY, JSON.stringify(draft));
}

export function readActiveCaseDraft(): InvestigationCaseDraft | null {
  try {
    const value = sessionStorage.getItem(ACTIVE_CASE_STORAGE_KEY);
    if (!value) return null;

    const parsedValue: unknown = JSON.parse(value);
    return isStoredCaseDraft(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
}