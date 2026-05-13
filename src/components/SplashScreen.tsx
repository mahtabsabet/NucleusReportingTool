import React, { useEffect, useState } from 'react';

const imageModules = import.meta.glob('../assets/splash/*', { eager: true, query: '?url', import: 'default' });
const imageUrls = Object.values(imageModules) as string[];

interface Props {
  onDone: () => void;
}

export function SplashScreen({ onDone }: Props) {
  const [titleVisible, setTitleVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const [src] = useState(() => {
    if (imageUrls.length === 0) return null;
    return imageUrls[Math.floor(Math.random() * imageUrls.length)];
  });

  useEffect(() => {
    if (!src) {
      onDone();
      return;
    }
    // Title fades in at 1s
    const titleTimer = setTimeout(() => setTitleVisible(true), 1000);
    // Whole screen starts fading at 3s (1s + 2s hold)
    const fadeTimer = setTimeout(() => setFading(true), 3000);
    // Done after 2s fade (3s + 2s)
    const doneTimer = setTimeout(() => onDone(), 5000);
    return () => {
      clearTimeout(titleTimer);
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [src, onDone]);

  if (!src) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        opacity: fading ? 0 : 1,
        transition: fading ? 'opacity 2s ease-in-out' : undefined,
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <img
        src={src}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.35) 100%)',
          opacity: titleVisible ? 1 : 0,
          transition: 'opacity 1.2s ease-in-out',
        }}
      >
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontWeight: 300,
            fontSize: 'clamp(2.2rem, 6vw, 4.5rem)',
            color: '#ffffff',
            letterSpacing: '0.08em',
            textShadow: '0 2px 24px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.4)',
            textAlign: 'center',
            padding: '0 1.5rem',
            lineHeight: 1.2,
          }}
        >
          Hello World!
        </h1>
      </div>
    </div>
  );
}
