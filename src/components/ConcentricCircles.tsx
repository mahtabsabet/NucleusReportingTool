import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserIcon, CheckIcon, XIcon } from 'lucide-react';
import { Activity } from '../types';
import {
  getPeopleForNucleus,
  getPersonName,
  personExists,
  getCirclePlacements,
  saveCirclePlacements,
  saveUnplacedNames,
  getUnplacedNames } from
'../data/store';
import { mockActivities } from '../data/mockData';
interface ConcentricCirclesProps {
  nucleusId: string;
  activities?: Activity[];
}
type Level = 'coordinating' | 'participating' | 'supporting' | 'aware';
const LEVEL_COLORS: Record<
  Level,
  {
    bg: string;
    border: string;
    highlight: string;
  }> =
{
  aware: {
    bg: '#f3f4f6',
    border: '#d1d5db',
    highlight: 'rgba(156,163,175,0.4)'
  },
  supporting: {
    bg: '#fef3c7',
    border: '#fbbf24',
    highlight: 'rgba(251,191,36,0.35)'
  },
  participating: {
    bg: '#d1fae5',
    border: '#34d399',
    highlight: 'rgba(52,211,153,0.35)'
  },
  coordinating: {
    bg: '#bfdbfe',
    border: '#60a5fa',
    highlight: 'rgba(96,165,250,0.4)'
  }
};
interface NameEntry {
  id: string;
  name: string;
}
export function ConcentricCircles({
  nucleusId,
  activities = []
}: ConcentricCirclesProps) {
  const navigate = useNavigate();
  // Initialize circles from saved placements or from participant data
  const initCircles = (): Record<Level, NameEntry[]> => {
    const saved = getCirclePlacements(nucleusId);
    if (saved) {
      const result: Record<Level, NameEntry[]> = {
        coordinating: [],
        supporting: [],
        participating: [],
        aware: []
      };
      for (const level of [
      'coordinating',
      'supporting',
      'participating',
      'aware'] as
      Level[]) {
        result[level] = (saved[level] || []).map((id) => ({
          id,
          name: getPersonName(id)
        }));
      }
      return result;
    }
    // First load: start with empty circles — all names go to unplaced
    return {
      coordinating: [],
      supporting: [],
      participating: [],
      aware: []
    };
  };
  const [circles, setCircles] =
  useState<Record<Level, NameEntry[]>>(initCircles);
  // Derive new names: all activity participants not yet placed in any circle
  const placedIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(circles).forEach((list) => list.forEach((p) => ids.add(p.id)));
    return ids;
  }, [circles]);
  const [newNames, setNewNames] = useState<NameEntry[]>(() => {
    const saved = getCirclePlacements(nucleusId);
    if (saved) {
      // Has saved placements — load saved unplaced names
      const savedUnplaced = getUnplacedNames(nucleusId);
      return savedUnplaced.map((id) => ({
        id,
        name: getPersonName(id)
      }));
    }
    // No saved placements — all people from nucleus start as unplaced
    const people = getPeopleForNucleus(nucleusId);
    return people.map((p) => ({
      id: p.id,
      name: p.name
    }));
  });
  // When activities change, check for new participants not yet placed
  useEffect(() => {
    const allActivities = [
    ...mockActivities.filter((a) => a.nucleusId === nucleusId),
    ...activities.filter((a) => !mockActivities.some((m) => m.id === a.id))];

    const newPeople: NameEntry[] = [];
    const seen = new Set<string>([...placedIds, ...newNames.map((n) => n.id)]);
    allActivities.forEach((activity) => {
      Object.values(activity.participants).
      flat().
      forEach((pid) => {
        if (!seen.has(pid)) {
          seen.add(pid);
          newPeople.push({
            id: pid,
            name: getPersonName(pid)
          });
        }
      });
    });
    if (newPeople.length > 0) {
      setNewNames((prev) => [...prev, ...newPeople]);
    }
  }, [activities, placedIds]);
  const [dragOverLevel, setDragOverLevel] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Mobile tap-to-place: select a person, then tap a circle to place them
  const [selectedPerson, setSelectedPerson] = useState<{
    id: string;
    sourceLevel: string;
  } | null>(null);
  const handleTapSelect = (id: string, sourceLevel: string) => {
    if (selectedPerson?.id === id) {
      setSelectedPerson(null); // deselect on second tap
    } else {
      setSelectedPerson({
        id,
        sourceLevel
      });
    }
  };
  const handleTapPlace = (targetLevel: string) => {
    if (!selectedPerson) return;
    const { id: participantId, sourceLevel } = selectedPerson;
    if (sourceLevel === targetLevel) {
      setSelectedPerson(null);
      return;
    }
    if (sourceLevel === 'new') {
      const person = newNames.find((n) => n.id === participantId);
      if (person) {
        setNewNames((prev) => prev.filter((n) => n.id !== participantId));
        setCircles((prev) => ({
          ...prev,
          [targetLevel]: [...prev[targetLevel as Level], person]
        }));
      }
    } else {
      setCircles((prev) => {
        const entry = prev[sourceLevel as Level].find(
          (p) => p.id === participantId
        );
        if (!entry) return prev;
        return {
          ...prev,
          [sourceLevel]: prev[sourceLevel as Level].filter(
            (p) => p.id !== participantId
          ),
          [targetLevel]: [...prev[targetLevel as Level], entry]
        };
      });
    }
    setSelectedPerson(null);
  };
  const handleDragStart = (
  e: React.DragEvent,
  id: string,
  sourceLevel: string) =>
  {
    e.dataTransfer.setData('participantId', id);
    e.dataTransfer.setData('sourceLevel', sourceLevel);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = useCallback((e: React.DragEvent, level: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverLevel(level);
  }, []);
  const handleDragLeave = useCallback(
    (e: React.DragEvent, level: string) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const { clientX, clientY } = e;
      if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom)
      {
        if (dragOverLevel === level) setDragOverLevel(null);
      }
    },
    [dragOverLevel]
  );
  const handleDrop = (e: React.DragEvent, targetLevel: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverLevel(null);
    const participantId = e.dataTransfer.getData('participantId');
    const sourceLevel = e.dataTransfer.getData('sourceLevel');
    if (sourceLevel === targetLevel) return;
    if (sourceLevel === 'new') {
      const person = newNames.find((n) => n.id === participantId);
      if (person) {
        setNewNames((prev) => prev.filter((n) => n.id !== participantId));
        setCircles((prev) => ({
          ...prev,
          [targetLevel]: [...prev[targetLevel as Level], person]
        }));
      }
    } else {
      setCircles((prev) => {
        const entry = prev[sourceLevel as Level].find(
          (p) => p.id === participantId
        );
        if (!entry) return prev;
        return {
          ...prev,
          [sourceLevel]: prev[sourceLevel as Level].filter(
            (p) => p.id !== participantId
          ),
          [targetLevel]: [...prev[targetLevel as Level], entry]
        };
      });
    }
  };
  const handleSave = () => {
    // Persist to store
    const placements: Record<string, string[]> = {};
    for (const level of [
    'coordinating',
    'supporting',
    'participating',
    'aware'] as
    Level[]) {
      placements[level] = circles[level].map((p) => p.id);
    }
    saveCirclePlacements(nucleusId, placements);
    saveUnplacedNames(
      nucleusId,
      newNames.map((n) => n.id)
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const renderNameChip = (entry: NameEntry, level: string) => {
    const hasProfile = personExists(entry.id);
    const isSelected = selectedPerson?.id === entry.id;
    return (
      <div key={entry.id} className="flex items-center gap-0.5 group">
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, entry.id, level)}
          onClick={(e) => {
            // Only use tap-to-place on touch devices / don't interfere with drag on desktop
            if ('ontouchstart' in window) {
              e.stopPropagation();
              handleTapSelect(entry.id, level);
            }
          }}
          className={`px-3 py-1.5 bg-white/95 backdrop-blur-sm border text-sm font-medium transition-all duration-200 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md hover:-translate-y-0.5 select-none ${isSelected ? 'border-blue-500 ring-2 ring-blue-300 bg-blue-50' : 'border-gray-200/80'} ${hasProfile ? 'text-blue-700 rounded-l-full rounded-r-none border-r-0' : 'text-gray-700 rounded-full'} ${isSelected && !hasProfile ? 'border-blue-500' : ''}`}>
          
          {entry.name}
        </div>
        {hasProfile &&
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/individual/${entry.id}`);
          }}
          className={`px-2 py-1.5 backdrop-blur-sm border rounded-r-full text-blue-600 hover:bg-blue-100 hover:text-blue-800 transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 ${isSelected ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-300' : 'bg-blue-50/90 border-blue-200/80'}`}
          title={`View ${entry.name}'s profile`}>
          
            <UserIcon className="w-4 h-4" />
          </button>
        }
      </div>);

  };
  const ringConfig: {
    level: Level;
    inset: string;
  }[] = [
  {
    level: 'aware',
    inset: '0%'
  },
  {
    level: 'supporting',
    inset: '12.5%'
  },
  {
    level: 'participating',
    inset: '25%'
  },
  {
    level: 'coordinating',
    inset: '37.5%'
  }];

  return (
    <div className="flex flex-col gap-8">
      {/* Mobile tap-to-place instruction */}
      {selectedPerson &&
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 lg:hidden">
          <p className="text-sm font-medium text-blue-800">
            Tap a circle to place{' '}
            <strong>{getPersonName(selectedPerson.id)}</strong>
          </p>
          <button
          onClick={() => setSelectedPerson(null)}
          className="text-blue-600 hover:text-blue-800 p-1">
          
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      }
      <div
        className="w-full relative mx-auto"
        style={{
          maxWidth: '500px',
          aspectRatio: '1/1'
        }}>
        
        <svg
          viewBox="0 0 400 400"
          className="w-full h-full absolute inset-0 z-0 pointer-events-none drop-shadow-sm">
          
          <circle
            cx="200"
            cy="200"
            r="195"
            fill={LEVEL_COLORS.aware.bg}
            stroke={
            dragOverLevel === 'aware' || selectedPerson ?
            LEVEL_COLORS.aware.border :
            'transparent'
            }
            strokeWidth={dragOverLevel === 'aware' ? 3 : selectedPerson ? 2 : 0}
            strokeDasharray={
            selectedPerson && dragOverLevel !== 'aware' ? '8 4' : 'none'
            }
            className="transition-all duration-300" />
          
          <circle
            cx="200"
            cy="200"
            r="150"
            fill={LEVEL_COLORS.supporting.bg}
            stroke={
            dragOverLevel === 'supporting' || selectedPerson ?
            LEVEL_COLORS.supporting.border :
            'transparent'
            }
            strokeWidth={
            dragOverLevel === 'supporting' ? 3 : selectedPerson ? 2 : 0
            }
            strokeDasharray={
            selectedPerson && dragOverLevel !== 'supporting' ? '8 4' : 'none'
            }
            className="transition-all duration-300" />
          
          <circle
            cx="200"
            cy="200"
            r="105"
            fill={LEVEL_COLORS.participating.bg}
            stroke={
            dragOverLevel === 'participating' || selectedPerson ?
            LEVEL_COLORS.participating.border :
            'transparent'
            }
            strokeWidth={
            dragOverLevel === 'participating' ? 3 : selectedPerson ? 2 : 0
            }
            strokeDasharray={
            selectedPerson && dragOverLevel !== 'participating' ?
            '8 4' :
            'none'
            }
            className="transition-all duration-300" />
          
          <circle
            cx="200"
            cy="200"
            r="65"
            fill={LEVEL_COLORS.coordinating.bg}
            stroke={
            dragOverLevel === 'coordinating' || selectedPerson ?
            LEVEL_COLORS.coordinating.border :
            'transparent'
            }
            strokeWidth={
            dragOverLevel === 'coordinating' ? 3 : selectedPerson ? 2 : 0
            }
            strokeDasharray={
            selectedPerson && dragOverLevel !== 'coordinating' ?
            '8 4' :
            'none'
            }
            className="transition-all duration-300" />
          
        </svg>

        {dragOverLevel &&
        <div className="absolute inset-0 z-[5] pointer-events-none">
            <div
            className="rounded-full border-4 border-dashed animate-pulse"
            style={{
              position: 'absolute',
              inset: ringConfig.find((r) => r.level === dragOverLevel)?.inset,
              borderColor: LEVEL_COLORS[dragOverLevel as Level]?.border,
              backgroundColor:
              LEVEL_COLORS[dragOverLevel as Level]?.highlight
            }} />
          
          </div>
        }

        <div className="absolute inset-0 z-10">
          <div
            className={`absolute rounded-full transition-all duration-300 ${selectedPerson ? 'cursor-pointer' : ''}`}
            style={{
              inset: '0%'
            }}
            onDragOver={(e) => handleDragOver(e, 'aware')}
            onDragLeave={(e) => handleDragLeave(e, 'aware')}
            onDrop={(e) => handleDrop(e, 'aware')}
            onClick={() => selectedPerson && handleTapPlace('aware')}>
            
            <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs font-semibold tracking-wide uppercase text-gray-500/80 z-20">
              Aware
            </div>
            <div
              className="absolute top-[10%] left-[10%] right-[10%] flex flex-wrap gap-2 justify-center z-20"
              style={{
                maxHeight: '18%'
              }}>
              
              {circles.aware.map((p) => renderNameChip(p, 'aware'))}
            </div>
          </div>

          <div
            className={`absolute rounded-full transition-all duration-300 ${selectedPerson ? 'cursor-pointer' : ''}`}
            style={{
              inset: '12.5%'
            }}
            onDragOver={(e) => handleDragOver(e, 'supporting')}
            onDragLeave={(e) => handleDragLeave(e, 'supporting')}
            onDrop={(e) => handleDrop(e, 'supporting')}
            onClick={() => selectedPerson && handleTapPlace('supporting')}>
            
            <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs font-semibold tracking-wide uppercase text-amber-700/60 z-20">
              Supporting
            </div>
            <div
              className="absolute top-[12%] left-[8%] right-[8%] flex flex-wrap gap-2 justify-center z-20"
              style={{
                maxHeight: '22%'
              }}>
              
              {circles.supporting.map((p) => renderNameChip(p, 'supporting'))}
            </div>
          </div>

          <div
            className={`absolute rounded-full transition-all duration-300 ${selectedPerson ? 'cursor-pointer' : ''}`}
            style={{
              inset: '25%'
            }}
            onDragOver={(e) => handleDragOver(e, 'participating')}
            onDragLeave={(e) => handleDragLeave(e, 'participating')}
            onDrop={(e) => handleDrop(e, 'participating')}
            onClick={() => selectedPerson && handleTapPlace('participating')}>
            
            <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs font-semibold tracking-wide uppercase text-emerald-700/60 z-20">
              Participating
            </div>
            <div
              className="absolute top-[14%] left-[6%] right-[6%] flex flex-wrap gap-2 justify-center z-20"
              style={{
                maxHeight: '28%'
              }}>
              
              {circles.participating.map((p) =>
              renderNameChip(p, 'participating')
              )}
            </div>
          </div>

          <div
            className={`absolute rounded-full transition-all duration-300 ${selectedPerson ? 'cursor-pointer' : ''}`}
            style={{
              inset: '37.5%'
            }}
            onDragOver={(e) => handleDragOver(e, 'coordinating')}
            onDragLeave={(e) => handleDragLeave(e, 'coordinating')}
            onDrop={(e) => handleDrop(e, 'coordinating')}
            onClick={() => selectedPerson && handleTapPlace('coordinating')}>
            
            <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs font-bold tracking-wide uppercase text-blue-800/70 z-20 whitespace-nowrap">
              Core Team
            </div>
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className="flex flex-wrap gap-2 justify-center px-4 mt-6">
                {circles.coordinating.map((p) =>
                renderNameChip(p, 'coordinating')
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-50/80 backdrop-blur-sm border border-gray-200/80 border-dashed rounded-xl p-5 flex flex-col items-center">
        <h3 className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wider">
          Unplaced — drag into a circle
        </h3>
        <div className="flex flex-wrap justify-center gap-3 mb-6 min-h-[40px]">
          {newNames.map((person) => renderNameChip(person, 'new'))}
          {newNames.length === 0 &&
          <p className="text-sm text-gray-400 italic py-2">
              All names placed ✓
            </p>
          }
        </div>

        <button
          onClick={handleSave}
          className="px-8 py-2.5 bg-blue-600 text-white font-medium rounded-full hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2">
          
          {saved ?
          <>
              <CheckIcon className="w-4 h-4" /> Saved Successfully
            </> :

          <>Save Placements</>
          }
        </button>
      </div>
    </div>);

}