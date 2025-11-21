import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  vertexShader,
  fragmentShader,
  createSonarUniforms,
  type SonarUniforms,
} from '@/lib/shaders/sonar-shader';

/**
 * Configuration options for SONAR animation
 */
export interface SonarAnimationOptions {
  intensity?: number; // Animation intensity (0-1)
  pulseFrequency?: number; // Pulse interval in seconds
  autoStart?: boolean; // Start animation on mount
}

/**
 * Hook for managing SONAR WebGL animation
 * Handles WebGL context, scene setup, animation loop, and cleanup
 * Automatically respects prefers-reduced-motion
 */
export function useSonarAnimation(options: SonarAnimationOptions = {}) {
  const { intensity = 1.0, pulseFrequency = 3.0, autoStart = true } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    camera: THREE.Camera;
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    uniforms: SonarUniforms;
    animationId: number;
  } | null>(null);

  const [isPlaying, setIsPlaying] = useState(autoStart);
  const [hasWebGL, setHasWebGL] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Detect reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Initialize WebGL scene
  useEffect(() => {
    if (!containerRef.current || prefersReducedMotion) return;

    const container = containerRef.current;

    // Check WebGL support
    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setHasWebGL(false);
        return;
      }
    } catch (e) {
      setHasWebGL(false);
      return;
    }

    // Setup Three.js scene
    const camera = new THREE.Camera();
    camera.position.z = 1;

    const scene = new THREE.Scene();
    const geometry = new THREE.PlaneGeometry(2, 2);

    const uniforms = createSonarUniforms();
    uniforms.intensity.value = intensity;
    uniforms.pulseFrequency.value = pulseFrequency;

    const material = new THREE.ShaderMaterial({
      uniforms: uniforms as any, // Cast to any for Three.js compatibility
      vertexShader,
      fragmentShader,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = new THREE.WebGLRenderer({
      antialias: window.devicePixelRatio <= 1, // Disable antialias on high-DPI screens
      alpha: true, // Transparent background
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x for performance

    container.appendChild(renderer.domElement);

    // Handle window resize
    const onWindowResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      uniforms.resolution.value.x = renderer.domElement.width;
      uniforms.resolution.value.y = renderer.domElement.height;
    };

    onWindowResize();
    window.addEventListener('resize', onWindowResize, false);

    // Animation loop
    let animationId: number;
    const animate = () => {
      if (!isPlaying) return;

      animationId = requestAnimationFrame(animate);
      uniforms.time.value += 0.016; // ~60fps
      renderer.render(scene, camera);

      if (sceneRef.current) {
        sceneRef.current.animationId = animationId;
      }
    };

    // Intersection Observer to pause when off-screen
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (isPlaying && !sceneRef.current?.animationId) {
              animate();
            }
          } else {
            if (sceneRef.current?.animationId) {
              cancelAnimationFrame(sceneRef.current.animationId);
              sceneRef.current.animationId = 0;
            }
          }
        });
      },
      { threshold: 0 }
    );

    observer.observe(container);

    // Store scene references
    sceneRef.current = {
      camera,
      scene,
      renderer,
      uniforms,
      animationId: 0,
    };

    // Start animation if autoStart
    if (isPlaying) {
      animate();
    }

    // Cleanup
    return () => {
      window.removeEventListener('resize', onWindowResize);
      observer.disconnect();

      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);

        if (container && sceneRef.current.renderer.domElement.parentNode) {
          container.removeChild(sceneRef.current.renderer.domElement);
        }

        sceneRef.current.renderer.dispose();
        geometry.dispose();
        material.dispose();
      }
    };
  }, [intensity, pulseFrequency, prefersReducedMotion]);

  // Handle play/pause state changes
  useEffect(() => {
    if (!sceneRef.current || prefersReducedMotion) return;

    const { uniforms, renderer, camera, scene } = sceneRef.current;

    if (isPlaying) {
      const animate = () => {
        const animationId = requestAnimationFrame(animate);
        uniforms.time.value += 0.016;
        renderer.render(scene, camera);

        if (sceneRef.current) {
          sceneRef.current.animationId = animationId;
        }
      };

      animate();
    } else {
      if (sceneRef.current.animationId) {
        cancelAnimationFrame(sceneRef.current.animationId);
      }
    }

    return () => {
      if (sceneRef.current?.animationId) {
        cancelAnimationFrame(sceneRef.current.animationId);
      }
    };
  }, [isPlaying, prefersReducedMotion]);

  return {
    containerRef,
    isPlaying,
    setIsPlaying,
    hasWebGL,
    prefersReducedMotion,
    play: () => setIsPlaying(true),
    pause: () => setIsPlaying(false),
    toggle: () => setIsPlaying((prev) => !prev),
  };
}
