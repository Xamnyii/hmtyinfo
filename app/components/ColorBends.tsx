"use client";

import { useEffect, useRef, memo } from "react";
import * as THREE from "three";

const MAX_COLORS = 8;

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const fragmentShader = `
#define MAX_COLORS ${MAX_COLORS}
uniform vec2 uCanvas;
uniform float uTime;
uniform float uSpeed;
uniform vec2 uRotation;
uniform int uColorCount;
uniform vec3 uColors[MAX_COLORS];
uniform float uScale;
uniform float uFrequency;
uniform float uWarpStrength;
uniform vec2 uPointer;
uniform float uMouseInfluence;
uniform float uParallax;
uniform float uNoise;
uniform int uIterations;
uniform float uIntensity;
uniform float uBandWidth;
varying vec2 vUv;

void main() {
  float time = uTime * uSpeed;
  vec2 point = vUv * 2.0 - 1.0;
  point += uPointer * uParallax * 0.1;
  vec2 rotated = vec2(
    point.x * uRotation.x - point.y * uRotation.y,
    point.x * uRotation.y + point.y * uRotation.x
  );
  vec2 wave = vec2(rotated.x * (uCanvas.x / uCanvas.y), rotated.y);
  wave /= max(uScale, 0.0001);
  wave /= 0.5 + 0.2 * dot(wave, wave);
  wave += 0.2 * cos(time) - 7.56;
  wave += (uPointer - rotated) * uMouseInfluence * 0.2;

  for (int pass = 0; pass < 5; pass++) {
    if (pass >= uIterations - 1) break;
    vec2 ripple = sin(1.5 * (wave.yx * uFrequency) + 2.0 * cos(wave * uFrequency));
    wave += (ripple - wave) * 0.15;
  }

  vec3 totalColor = vec3(0.0);
  float coverage = 0.0;
  vec2 layer = wave;
  for (int index = 0; index < MAX_COLORS; index++) {
    if (index >= uColorCount) break;
    layer -= 0.01;
    vec2 ripple = sin(1.5 * (layer.yx * uFrequency) + 2.0 * cos(layer * uFrequency));
    float base = length(ripple + sin(5.0 * ripple.y * uFrequency - 3.0 * time + float(index)) / 4.0);
    float belowOne = clamp(uWarpStrength, 0.0, 1.0);
    vec2 warped = layer + (ripple - layer) * belowOne * (1.0 + max(uWarpStrength - 1.0, 0.0));
    float displaced = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * time + float(index)) / 4.0);
    float amount = mix(base, displaced, pow(belowOne, 0.3));
    float band = 1.0 - exp(-uBandWidth / exp(uBandWidth * amount));
    totalColor += uColors[index] * band;
    coverage = max(coverage, band);
  }

  totalColor = clamp(totalColor * uIntensity, 0.0, 1.0);
  if (uNoise > 0.0001) {
    float grain = fract(sin(dot(gl_FragCoord.xy + vec2(uTime), vec2(12.9898, 78.233))) * 43758.5453123);
    totalColor = clamp(totalColor + (grain - 0.5) * uNoise, 0.0, 1.0);
  }
  gl_FragColor = vec4(totalColor * coverage, coverage);
}
`;

type ColorBendsProps = {
  colors: string[];
  rotation?: number;
  speed?: number;
  scale?: number;
  frequency?: number;
  warpStrength?: number;
  mouseInfluence?: number;
  noise?: number;
  parallax?: number;
  iterations?: number;
  intensity?: number;
  bandWidth?: number;
  className?: string;
};

function hexToVector(hex: string) {
  const normalized = hex.replace("#", "").trim();
  const value = normalized.length === 3
    ? normalized.split("").map((digit) => parseInt(digit + digit, 16))
    : [parseInt(normalized.slice(0, 2), 16), parseInt(normalized.slice(2, 4), 16), parseInt(normalized.slice(4, 6), 16)];
  return new THREE.Vector3(value[0] / 255, value[1] / 255, value[2] / 255);
}

export default memo(function ColorBends({
  colors,
  rotation = 180,
  speed = 0.81,
  scale = 2.3,
  frequency = 1,
  warpStrength = 1,
  mouseInfluence = 1,
  noise = 0.06,
  parallax = 1.15,
  iterations = 1,
  intensity = 1.5,
  bandWidth = 2.5,
  className,
}: ColorBendsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const colorValues = Array.from({ length: MAX_COLORS }, () => new THREE.Vector3());
    colors.slice(0, MAX_COLORS).forEach((color, index) => colorValues[index].copy(hexToVector(color)));
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      premultipliedAlpha: true,
      uniforms: {
        uCanvas: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 }, uSpeed: { value: speed },
        uRotation: { value: new THREE.Vector2(1, 0) },
        uColorCount: { value: Math.min(colors.length, MAX_COLORS) }, uColors: { value: colorValues },
        uScale: { value: scale }, uFrequency: { value: frequency },
        uWarpStrength: { value: warpStrength }, uPointer: { value: new THREE.Vector2() },
        uMouseInfluence: { value: mouseInfluence }, uParallax: { value: parallax },
        uNoise: { value: noise }, uIterations: { value: iterations },
        uIntensity: { value: intensity }, uBandWidth: { value: bandWidth },
      },
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;";
    container.appendChild(renderer.domElement);

    const pointer = new THREE.Vector2();
    const target = new THREE.Vector2();
    const resize = () => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      renderer.setSize(width, height, false);
      material.uniforms.uCanvas.value.set(width, height);
    };
    const move = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      target.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    container.addEventListener("pointermove", move);
    resize();
    let frame = 0;
    const startedAt = performance.now();
    let previousFrameAt = startedAt;
    const render = (timestamp: number) => {
      const elapsed = (timestamp - startedAt) / 1000;
      const delta = Math.min(1, (timestamp - previousFrameAt) / 1000);
      previousFrameAt = timestamp;
      material.uniforms.uTime.value = elapsed;
      const radians = (rotation * Math.PI) / 180;
      material.uniforms.uRotation.value.set(Math.cos(radians), Math.sin(radians));
      pointer.lerp(target, Math.min(1, delta * 8));
      material.uniforms.uPointer.value.copy(pointer);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      container.removeEventListener("pointermove", move);
      geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [bandWidth, colors, frequency, intensity, iterations, mouseInfluence, noise, parallax, rotation, scale, speed, warpStrength]);

  return <div aria-hidden="true" ref={containerRef} className={className} style={{ height: "100%", width: "100%" }} />;
});