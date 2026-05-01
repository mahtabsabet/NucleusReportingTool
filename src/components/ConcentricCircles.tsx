import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserIcon, CheckIcon } from 'lucide-react';
import {
  fetchNucleusEnrollmentsWithNames,
  updateEngagementLevel,
} from '../lib/db/nucleus';

interface ConcentricCirclesProps {
  nucleusId: string;
}

type Level = 'coordinating' | 'participating' | 'supporting' | 'aware';

const LEVEL_COLORS: Record<Level, { bg: string; border: string; highlight: string }> = {
  aware: { bg: '#f3f4f6', border: '#d1d5db', highlight: 'rgba(156,163,175,0.4)' },
  supporting: { bg: '#fef3c7', border: '#fbbf24', highlight: 'rgba(251,191,36,0.35)' },
  participating: { bg: '#d1fae5', border: '#34d399', highlight: 'rgba(52,211,153,0.35)' },
  coordinating: { bg: '#bfdbfe', border: '#60a5fa', highlight: 'rgba(96,165,250,0.4)' },
};

interface NameEntry {
  id: string;
  name: string;
}

export function ConcentricCircles({ nucleusId }: ConcentricCirclesProps) {
  const navigate = useNavigate();

  const [circles, setCircles] = useState<Record<Level, NameEntry[]>>({
    coordinating: [],
    supporting: [],
    participating: [],
    aware: [],
  });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [dragOverLevel, setDragOverLevel] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<{ id: string; sourceLevel: Level } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchNucleusEnrollmentsWithNames(nucleusId)
      .then(enrollments => {
        const result: Record<Level, NameEntry[]> = {
          coordinating: [], supporting: [], participating: [], aware: [],
        };
        enrollments.forEach(e => {
          result[e.engagementLevel].push({ id: e.personId, name: e.name });
        });
        setCircles(result);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [nucleusId]);

  const handleSave = async () => {
    const updates: Promise<void>[] = [];
    for (const level of ['coordinating', 'supporting', 'participating', 'aware'] as Level[]) {
      for (const entry of circles[level]) {
        updates.push(updateEngagementLevel(entry.id, nucleusId, level));
      }
    }
    try {
      await Promise.all(updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save engagement levels:', err);
    }
  };

  const handleTapSelect = (id: string, sourceLevel: Level) => {
    if (selectedPerson?.id === id) {
      setSelectedPerson(null);
    } else {
      setSelectedPerson({ id, sourceLevel });
    }
  };

  const handleTapPlace = (targetLevel: Level) => {
    if (!selectedPerson) return;
    const { id: participantId, sourceLevel } = selectedPerson;
    if (sourceLevel === targetLevel) { setSelectedPerson(null); return; }
    setCircles(prev => {
      const entry = prev[sourceLevel].find(p => p.id === participantId);
      if (!entry) return prev;
      return {
        ...prev,
        [sourceLevel]: prev[sourceLevel].filter(p => p.id !== participantId),
        [targetLevel]: [...prev[targetLevel], entry],
      };
    });
    setSelectedPerson(null);
  };

  const handleDragStart = (e: React.DragEvent, id: string, sourceLevel: Level) => {
    e.dataTransfer.setData('participantId', id);
    e.dataTransfer.setData('sourceLevel', sourceLevel);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = useCallback((e: React.DragEvent, level: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverLevel(level);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, level: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { clientX, clientY } = e;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      if (dragOverLevel === level) setDragOverLevel(null);
    }
  }, [dragOverLevel]);

  const handleDrop = (e: React.DragEvent, targetLevel: Level) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverLevel(null);
    const participantId = e.dataTransfer.getData('participantId');
    const sourceLevel = e.dataTransfer.getData('sourceLevel') as Level;
    if (sourceLevel === targetLevel) return;
    setCircles(prev => {
      const entry = prev[sourceLevel].find(p => p.id === participantId);
      if (!entry) return prev;
      return {
        ...prev,
        [sourceLevel]: prev[sourceLevel].filter(p => p.id !== participantId),
        [targetLevel]: [...prev[targetLevel], entry],
      };
    });
  };

  const renderNameChip = (entry: NameEntry, level: Level) => {
    const isSelected = selectedPerson?.id === entry.id;
    return (
      <div key={entry.id} className="flex items-center gap-0.5 group">
        <div
          draggable
          onDragStart={e => handleDragStart(e, entry.id, level)}
          onClick={e => {
            if ('ontouchstart' in window) {
              e.stopPropagation();
              handleTapSelect(entry.id, level);
            }
          }}
          className={`px-3 py-1.5 bg-white/95 backdrop-blur-sm border text-sm font-medium transition-all duration-200 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md hover:-translate-y-0.5 select-none rounded-l-full rounded-r-none border-r-0 text-blue-700 ${
            isSelected ? 'border-blue-500 ring-2 ring-blue-300 bg-blue-50' : 'border-gray-200/80'
          }`}
        >
          {entry.name}
        </div>
        <button
          onClick={e => { e.stopPropagation(); navigate(`/individual/${entry.id}`); }}
          className={`px-2 py-1.5 backdrop-blur-sm border rounded-r-full text-blue-600 hover:bg-blue-100 hover:text-blue-800 transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 ${
            isSelected ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-300' : 'bg-blue-50/90 border-blue-200/80'
          }`}
          title={`View ${entry.name}'s profile`}
        >
          <UserIcon className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const ringConfig: { level: Level; inset: string }[] = [
    { level: 'aware', inset: '0%' },
    { level: 'supporting', inset: '12.5%' },
    { level: 'participating', inset: '25%' },
    { level: 'coordinating', inset: '37.5%' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {selectedPerson && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 lg:hidden">
          <p className="text-sm font-medium text-blue-800">
            Tap a circle to place <strong>{circles[selectedPerson.sourceLevel].find(p => p.id === selectedPerson.id)?.name}</strong>
          </p>
          <button onClick={() => setSelectedPerson(null)} className="text-blue-600 hover:text-blue-800 p-1">✕</button>
        </div>
      )}

      <div className="w-full relative mx-auto" style={{ maxWidth: '500px', aspectRatio: '1/1' }}>
        <svg viewBox="0 0 400 400" className="w-full h-full absolute inset-0 z-0 pointer-events-none drop-shadow-sm">
          {(['aware', 'supporting', 'participating', 'coordinating'] as Level[]).map((level, i) => {
            const radii = [195, 150, 105, 65];
            return (
              <circle
                key={level}
                cx="200" cy="200" r={radii[i]}
                fill={LEVEL_COLORS[level].bg}
                stroke={dragOverLevel === level || selectedPerson ? LEVEL_COLORS[level].border : 'transparent'}
                strokeWidth={dragOverLevel === level ? 3 : selectedPerson ? 2 : 0}
                strokeDasharray={selectedPerson && dragOverLevel !== level ? '8 4' : 'none'}
                className="transition-all duration-300"
              />
            );
          })}
        </svg>

        {dragOverLevel && (
          <div className="absolute inset-0 z-[5] pointer-events-none">
            <div
              className="rounded-full border-4 border-dashed animate-pulse"
              style={{
                position: 'absolute',
                inset: ringConfig.find(r => r.level === dragOverLevel)?.inset,
                borderColor: LEVEL_COLORS[dragOverLevel as Level]?.border,
                backgroundColor: LEVEL_COLORS[dragOverLevel as Level]?.highlight,
              }}
            />
          </div>
        )}

        <div className="absolute inset-0 z-10">
          {ringConfig.map(({ level, inset }) => (
            <div
              key={level}
              className={`absolute rounded-full transition-all duration-300 ${selectedPerson ? 'cursor-pointer' : ''}`}
              style={{ inset }}
              onDragOver={e => handleDragOver(e, level)}
              onDragLeave={e => handleDragLeave(e, level)}
              onDrop={e => handleDrop(e, level)}
              onClick={() => selectedPerson && handleTapPlace(level)}
            >
              <div className={`absolute top-3 left-1/2 -translate-x-1/2 text-xs font-semibold tracking-wide uppercase z-20 ${
                level === 'aware' ? 'text-gray-500/80' :
                level === 'supporting' ? 'text-amber-700/60' :
                level === 'participating' ? 'text-emerald-700/60' :
                'text-blue-800/70 font-bold whitespace-nowrap'
              }`}>
                {level === 'coordinating' ? 'Core Team' : level.charAt(0).toUpperCase() + level.slice(1)}
              </div>
              {level === 'coordinating' ? (
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <div className="flex flex-wrap gap-2 justify-center px-4 mt-6">
                    {circles[level].map(p => renderNameChip(p, level))}
                  </div>
                </div>
              ) : (
                <div
                  className="absolute flex flex-wrap gap-2 justify-center z-20"
                  style={{
                    top: level === 'aware' ? '10%' : level === 'supporting' ? '12%' : '14%',
                    left: level === 'aware' ? '10%' : level === 'supporting' ? '8%' : '6%',
                    right: level === 'aware' ? '10%' : level === 'supporting' ? '8%' : '6%',
                    maxHeight: level === 'aware' ? '18%' : level === 'supporting' ? '22%' : '28%',
                  }}
                >
                  {circles[level].map(p => renderNameChip(p, level))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={handleSave}
          className="px-8 py-2.5 bg-blue-600 text-white font-medium rounded-full hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
        >
          {saved ? (
            <><CheckIcon className="w-4 h-4" /> Saved Successfully</>
          ) : (
            'Save Engagement Levels'
          )}
        </button>
      </div>
    </div>
  );
}
