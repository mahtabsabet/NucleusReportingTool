import React, { useEffect, useState } from 'react';

const imageModules = import.meta.glob('../assets/splash/*', { eager: true, query: '?url', import: 'default' });
const imageUrls = Object.values(imageModules) as string[];

interface Props {
  onDone: () => void;
}

export function SplashScreen({ onDone }: Props) {
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
    const showTimer = setTimeout(() => setFading(true), 2000);
    const doneTimer = setTimeout(() => onDone(), 2800);
    return () => {
      clearTimeout(showTimer);
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
        transition: 'opacity 0.8s ease-in-out',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <img
        src={src}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
}
