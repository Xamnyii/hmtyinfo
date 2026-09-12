import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-5xl font-extrabold text-foreground">404</h1>
      <p className="text-muted-foreground">
        Esta página no existe.
      </p>
      <Link to="/" className="font-semibold text-primary hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
};

export default NotFound;
