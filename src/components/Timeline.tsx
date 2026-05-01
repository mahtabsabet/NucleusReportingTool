import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { ChevronRightIcon, PlusIcon, MinusIcon, XIcon } from 'lucide-react';
import {
  getTimelineCycles,
  getTimelineEvents,
  updateCycleBoundary,
  addTimelineEvent } from
'../data/store';
import { TimelineCycle, TimelineEvent } from '../types';
type ZoomLevel = 'multi-year' | 'year' | 'cycle' | 'month';
interface TimelineProps {
  clusterId: string | null;
}
export function Timeline({ clusterId }: TimelineProps) {
  const [cycles, setCycles] = useState<TimelineCycle[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('multi-year');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<TimelineCycle | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<{
    start: Date;
    end: Date;
    label: string;
  } | null>(null);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [panelHeight, setPanelHeight] = useState(256); // default h-64 = 256px
  const scrollRef = useRef<HTMLDivElement>(null);
  // Load data
  useEffect(() => {
    setCycles(getTimelineCycles());
    setEvents(
      getTimelineEvents({
        clusterId: clusterId || undefined
      })
    );
  }, [clusterId]);
  // Adjust cycle boundary by +/- days
  const adjustCycleBoundary = (cycleId: string, days: number) => {
    const cycleIndex = cycles.findIndex((c) => c.id === cycleId);
    if (cycleIndex === -1) return;
    const cycle = cycles[cycleIndex];
    const newEnd = new Date(cycle.endDate);
    newEnd.setDate(newEnd.getDate() + days);
    // Don't let end date go before start date + 7 days minimum
    const minEnd = new Date(cycle.startDate);
    minEnd.setDate(minEnd.getDate() + 7);
    if (newEnd < minEnd) return;
    // Update this cycle's end and next cycle's start
    updateCycleBoundary(cycleId, undefined, newEnd);
    if (cycleIndex + 1 < cycles.length) {
      const nextStart = new Date(newEnd);
      nextStart.setDate(nextStart.getDate() + 1);
      updateCycleBoundary(cycles[cycleIndex + 1].id, nextStart, undefined);
    }
    // Refresh from store
    setCycles(getTimelineCycles());
  };
  // Group cycles by year for multi-year view
  const years = Array.from(
    new Set(cycles.map((c) => c.startDate.getFullYear()))
  ).sort();
  const handleYearClick = (year: number) => {
    setSelectedYear(year);
    setZoomLevel('year');
  };
  const handleCycleClick = (cycle: TimelineCycle) => {
    setSelectedCycle(cycle);
    setZoomLevel('cycle');
  };
  const handleMonthClick = (start: Date, end: Date, label: string) => {
    setSelectedMonth({
      start,
      end,
      label
    });
    setZoomLevel('month');
  };
  const handleAddEvent = () => {
    if (!newEventName.trim() || !newEventDate) return;
    const date = new Date(newEventDate);
    // Adjust for timezone offset to prevent off-by-one errors
    date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
    addTimelineEvent({
      name: newEventName.trim(),
      startDate: date,
      clusterId: clusterId || undefined,
      location: newEventLocation.trim() || undefined
    });
    setEvents(
      getTimelineEvents({
        clusterId: clusterId || undefined
      })
    );
    setIsAddingEvent(false);
    setNewEventName('');
    setNewEventDate('');
    setNewEventLocation('');
  };
  // Helper to format dates
  const formatDate = (d: Date) =>
  d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
  const formatMonth = (d: Date) =>
  d.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric'
  });
  const formatDateRange = (e: TimelineEvent) => {
    if (e.endDate) {
      return `${formatDate(e.startDate)} – ${formatDate(e.endDate)}`;
    }
    return formatDate(e.startDate);
  };
  const [hoveredEvent, setHoveredEvent] = useState<{
    event: TimelineEvent;
    x: number;
    y: number;
  } | null>(null);
  // Calculate position as percentage within a time range
  const getDatePercent = (date: Date, rangeStart: Date, rangeEnd: Date) => {
    const total = rangeEnd.getTime() - rangeStart.getTime();
    if (total <= 0) return 0;
    return Math.max(
      0,
      Math.min(100, (date.getTime() - rangeStart.getTime()) / total * 100)
    );
  };
  // Render events for a specific time range, positioned proportionally
  const renderEvents = (start: Date, end: Date) => {
    const rangeEvents = events.filter((e) => {
      const evtEnd = e.endDate || e.startDate;
      return evtEnd >= start && e.startDate <= end;
    });
    if (rangeEvents.length === 0) return null;
    // Sort by start date, then by duration (longer first) for stacking
    const sorted = [...rangeEvents].sort((a, b) => {
      const diff = a.startDate.getTime() - b.startDate.getTime();
      if (diff !== 0) return diff;
      const aDur = (a.endDate || a.startDate).getTime() - a.startDate.getTime();
      const bDur = (b.endDate || b.startDate).getTime() - b.startDate.getTime();
      return bDur - aDur;
    });
    // Assign rows to avoid overlaps
    const rows: Array<{
      end: number;
    }> = [];
    const eventRows: number[] = [];
    for (const evt of sorted) {
      const evtStart = getDatePercent(evt.startDate, start, end);
      const evtEnd = evt.endDate ?
      getDatePercent(evt.endDate, start, end) :
      evtStart + 1.5; // dots take ~1.5% width
      let placed = false;
      for (let r = 0; r < rows.length; r++) {
        if (evtStart >= rows[r].end + 0.5) {
          rows[r].end = evtEnd;
          eventRows.push(r);
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows.push({
          end: evtEnd
        });
        eventRows.push(rows.length - 1);
      }
    }
    return (
      <div
        className="absolute left-0 right-0 bottom-[55%]"
        style={{
          height: `${rows.length * 14 + 4}px`
        }}>
        
        {sorted.map((e, i) => {
          const isBar = e.endDate && e.endDate.getTime() > e.startDate.getTime();
          const leftPct = getDatePercent(e.startDate, start, end);
          const rightPct = isBar ?
          getDatePercent(e.endDate!, start, end) :
          leftPct;
          const row = eventRows[i];
          const bottomOffset = row * 14 + 2;
          if (isBar) {
            return (
              <div
                key={e.id}
                className="absolute cursor-help"
                style={{
                  left: `${leftPct}%`,
                  width: `${Math.max(rightPct - leftPct, 1)}%`,
                  bottom: `${bottomOffset}px`,
                  height: '10px'
                }}
                onMouseEnter={(ev) => {
                  const rect = ev.currentTarget.getBoundingClientRect();
                  setHoveredEvent({
                    event: e,
                    x: rect.left + rect.width / 2,
                    y: rect.top
                  });
                }}
                onMouseLeave={() => setHoveredEvent(null)}>
                
                <div className="w-full h-full bg-blue-400/80 rounded-sm border border-blue-500/50" />
              </div>);

          }
          return (
            <div
              key={e.id}
              className="absolute w-2.5 h-2.5 rounded-full bg-blue-500 cursor-help"
              style={{
                left: `${leftPct}%`,
                bottom: `${bottomOffset}px`,
                transform: 'translateX(-50%)'
              }}
              onMouseEnter={(ev) => {
                const rect = ev.currentTarget.getBoundingClientRect();
                setHoveredEvent({
                  event: e,
                  x: rect.left + rect.width / 2,
                  y: rect.top
                });
              }}
              onMouseLeave={() => setHoveredEvent(null)} />);


        })}
      </div>);

  };
  return (
    <div
      className="bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex flex-col font-sans relative z-40"
      style={{
        height: `${panelHeight}px`
      }}>
      
      {/* Resize handle */}
      <div
        className="flex items-center justify-center gap-2 py-1 border-b border-gray-100 bg-gray-50/30 cursor-row-resize select-none"
        onMouseDown={(e) => {
          e.preventDefault();
          const startY = e.clientY;
          const startH = panelHeight;
          const onMove = (ev: MouseEvent) => {
            const newH = Math.max(
              150,
              Math.min(500, startH - (ev.clientY - startY))
            );
            setPanelHeight(newH);
          };
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}>
        
        <div className="w-8 h-1 rounded-full bg-gray-300" />
      </div>
      {/* Header & Breadcrumbs */}
      <div className="flex items-center justify-between px-6 py-2 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
          <button
            onClick={() => setZoomLevel('multi-year')}
            className={`hover:text-blue-600 transition-colors ${zoomLevel === 'multi-year' ? 'text-gray-900' : ''}`}>
            
            All Years
          </button>

          {zoomLevel !== 'multi-year' && selectedYear &&
          <>
              <ChevronRightIcon className="w-4 h-4 text-gray-400" />
              <button
              onClick={() => setZoomLevel('year')}
              className={`hover:text-blue-600 transition-colors ${zoomLevel === 'year' ? 'text-gray-900' : ''}`}>
              
                {selectedYear}
              </button>
            </>
          }

          {(zoomLevel === 'cycle' || zoomLevel === 'month') &&
          selectedCycle &&
          <>
                <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                <button
              onClick={() => setZoomLevel('cycle')}
              className={`hover:text-blue-600 transition-colors ${zoomLevel === 'cycle' ? 'text-gray-900' : ''}`}>
              
                  {selectedCycle.label}
                </button>
              </>
          }

          {zoomLevel === 'month' && selectedMonth &&
          <>
              <ChevronRightIcon className="w-4 h-4 text-gray-400" />
              <span className="text-gray-900">{selectedMonth.label}</span>
            </>
          }
        </div>

        <button
          onClick={() => setIsAddingEvent(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors">
          
          <PlusIcon className="w-3.5 h-3.5" />
          Add Event
        </button>
      </div>

      {/* Timeline Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden relative p-8 flex items-center">
        
        <div className="min-w-max w-full flex items-center h-full relative px-8">
          {/* Main horizontal line */}
          <div className="absolute left-8 right-8 h-0.5 bg-gray-300 top-1/2 -translate-y-1/2" />

          {/* MULTI-YEAR VIEW */}
          {zoomLevel === 'multi-year' &&
          years.map((year) => {
            const yearCycles = cycles.filter(
              (c) => c.startDate.getFullYear() === year
            );
            if (yearCycles.length === 0) return null;
            const yearStart = yearCycles[0].startDate;
            const yearEnd = yearCycles[yearCycles.length - 1].endDate;
            return (
              <div
                key={year}
                className="flex-1 min-w-[300px] relative h-full flex flex-col justify-center group cursor-pointer"
                onClick={() => handleYearClick(year)}>
                
                  <div className="absolute top-1/2 -translate-y-1/2 left-0 w-0.5 h-4 bg-gray-400" />
                  <div className="absolute -top-8 left-2 font-bold text-gray-900 text-lg group-hover:text-blue-600 transition-colors">
                    {year}
                  </div>
                  <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-around">
                    {yearCycles.map((cycle) =>
                  <div
                    key={cycle.id}
                    className="bg-white px-2 text-xs font-medium text-gray-500 group-hover:text-blue-500 z-10">
                    
                        {cycle.label}
                      </div>
                  )}
                  </div>
                  {renderEvents(yearStart, yearEnd)}
                </div>);

          })}

          {/* YEAR VIEW */}
          {zoomLevel === 'year' &&
          selectedYear &&
          cycles.
          filter((c) => c.startDate.getFullYear() === selectedYear).
          map((cycle, index, arr) =>
          <div
            key={cycle.id}
            className="flex-1 min-w-[250px] relative h-full flex flex-col justify-center group">
            
                  {/* Start boundary */}
                  <div className="absolute top-1/2 -translate-y-1/2 left-0 w-0.5 h-6 bg-gray-400" />
                  <div className="absolute top-1/2 mt-4 left-0 -translate-x-1/2 text-xs font-medium text-gray-500">
                    {formatDate(cycle.startDate)}
                  </div>

                  {/* End boundary with +/- buttons */}
                  <div className="absolute top-1/2 -translate-y-1/2 right-0 w-0.5 h-6 bg-gray-400 z-20" />
                  <div className="absolute top-1/2 mt-4 right-0 translate-x-[-50%] flex flex-col items-center gap-1 z-20">
                    <div className="text-xs font-medium text-gray-500">
                      {formatDate(cycle.endDate)}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                  onClick={(e) => {
                    e.stopPropagation();
                    adjustCycleBoundary(cycle.id, -1);
                  }}
                  className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-600 transition-colors"
                  title="Shorten cycle by 1 day">
                  
                        <MinusIcon className="w-3 h-3" />
                      </button>
                      <button
                  onClick={(e) => {
                    e.stopPropagation();
                    adjustCycleBoundary(cycle.id, 1);
                  }}
                  className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-gray-500 hover:text-blue-600 transition-colors"
                  title="Extend cycle by 1 day">
                  
                        <PlusIcon className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div
              className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-center cursor-pointer"
              onClick={() => handleCycleClick(cycle)}>
              
                    <div className="bg-white px-3 py-1 text-sm font-bold text-gray-900 group-hover:text-blue-600 z-10 border border-transparent group-hover:border-blue-100 rounded-full transition-all">
                      {cycle.label}
                    </div>
                  </div>
                  {renderEvents(cycle.startDate, cycle.endDate)}
                </div>
          )}

          {/* CYCLE VIEW */}
          {zoomLevel === 'cycle' &&
          selectedCycle &&
          (() => {
            // Generate months for this cycle
            const months = [];
            let curr = new Date(selectedCycle.startDate);
            while (curr <= selectedCycle.endDate) {
              const monthEnd = new Date(
                curr.getFullYear(),
                curr.getMonth() + 1,
                0
              );
              const actualEnd =
              monthEnd > selectedCycle.endDate ?
              selectedCycle.endDate :
              monthEnd;
              months.push({
                start: new Date(curr),
                end: new Date(actualEnd),
                label: formatMonth(curr)
              });
              curr = new Date(curr.getFullYear(), curr.getMonth() + 1, 1);
            }
            return months.map((month, index) =>
            <div
              key={index}
              className="flex-1 min-w-[200px] relative h-full flex flex-col justify-center group cursor-pointer"
              onClick={() =>
              handleMonthClick(month.start, month.end, month.label)
              }>
              
                  <div className="absolute top-1/2 -translate-y-1/2 left-0 w-0.5 h-4 bg-gray-400" />
                  <div className="absolute top-1/2 mt-3 left-0 -translate-x-1/2 text-xs font-medium text-gray-500">
                    {formatDate(month.start)}
                  </div>
                  {index === months.length - 1 &&
              <div className="absolute top-1/2 mt-3 right-0 translate-x-1/2 text-xs font-medium text-gray-500">
                      {formatDate(month.end)}
                    </div>
              }
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 font-bold text-gray-900 text-sm group-hover:text-blue-600 bg-white px-2 z-10">
                    {month.label}
                  </div>
                  {renderEvents(month.start, month.end)}
                </div>
            );
          })()}

          {/* MONTH VIEW */}
          {zoomLevel === 'month' &&
          selectedMonth &&
          (() => {
            // Generate weeks (roughly 7 day chunks)
            const weeks = [];
            let curr = new Date(selectedMonth.start);
            let weekNum = 1;
            while (curr <= selectedMonth.end) {
              const weekEnd = new Date(curr);
              weekEnd.setDate(weekEnd.getDate() + 6);
              const actualEnd =
              weekEnd > selectedMonth.end ? selectedMonth.end : weekEnd;
              weeks.push({
                start: new Date(curr),
                end: new Date(actualEnd),
                label: `Week ${weekNum}`
              });
              curr = new Date(actualEnd);
              curr.setDate(curr.getDate() + 1);
              weekNum++;
            }
            return weeks.map((week, index) =>
            <div
              key={index}
              className="flex-1 min-w-[150px] relative h-full flex flex-col justify-center">
              
                  <div className="absolute top-1/2 -translate-y-1/2 left-0 w-0.5 h-3 bg-gray-400" />
                  <div className="absolute top-1/2 mt-2 left-0 -translate-x-1/2 text-[10px] font-medium text-gray-400">
                    {formatDate(week.start)}
                  </div>
                  {index === weeks.length - 1 &&
              <div className="absolute top-1/2 mt-2 right-0 translate-x-1/2 text-[10px] font-medium text-gray-400">
                      {formatDate(week.end)}
                    </div>
              }
                  <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 bg-white px-2 text-xs font-semibold text-gray-700 z-10">
                    {week.label}
                  </div>
                  {renderEvents(week.start, week.end)}
                </div>
            );
          })()}
        </div>
      </div>

      {/* Event Tooltip (fixed position to escape overflow) */}
      {hoveredEvent &&
      <div
        className="fixed pointer-events-none"
        style={{
          left: hoveredEvent.x,
          top: hoveredEvent.y - 8,
          transform: 'translate(-50%, -100%)',
          zIndex: 9999
        }}>
        
          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap max-w-[300px]">
            <div className="font-bold">{hoveredEvent.event.name}</div>
            <div className="text-gray-300 mt-0.5">
              {formatDateRange(hoveredEvent.event)}
            </div>
            {hoveredEvent.event.location &&
          <div className="text-gray-400 mt-0.5 flex items-center gap-1">
                <span>📍</span> {hoveredEvent.event.location}
              </div>
          }
          </div>
        </div>
      }

      {/* Add Event Modal - rendered via portal to escape stacking contexts */}
      {isAddingEvent &&
      ReactDOM.createPortal(
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
          style={{
            zIndex: 10000
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddingEvent(false);
          }}>
          
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-bold text-gray-900">
                  Add Timeline Event
                </h3>
                <button
                onClick={() => setIsAddingEvent(false)}
                className="text-gray-400 hover:text-gray-600">
                
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Event Name
                  </label>
                  <input
                  type="text"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="e.g. Expansion Phase"
                  autoFocus />
                
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Date
                  </label>
                  <input
                  type="date"
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Location{' '}
                    <span className="text-gray-400 font-normal">
                      (optional)
                    </span>
                  </label>
                  <input
                  type="text"
                  value={newEventLocation}
                  onChange={(e) => setNewEventLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="e.g. Community Centre" />
                
                </div>
                <div className="pt-2 flex gap-3">
                  <button
                  onClick={() => setIsAddingEvent(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50">
                  
                    Cancel
                  </button>
                  <button
                  onClick={handleAddEvent}
                  disabled={!newEventName.trim() || !newEventDate}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                  
                    Save Event
                  </button>
                </div>
              </div>
            </div>
          </div>,
        document.body
      )}
    </div>);

}