const storageKey = (nucleusId: string) => `nucleus-unplaced-${nucleusId}`;

export function markPersonUnplaced(nucleusId: string, personId: string): void {
  const stored = getUnplacedPersonIds(nucleusId);
  if (!stored.includes(personId)) {
    localStorage.setItem(storageKey(nucleusId), JSON.stringify([...stored, personId]));
  }
}

export function clearPersonUnplaced(nucleusId: string, personId: string): void {
  const stored = getUnplacedPersonIds(nucleusId);
  localStorage.setItem(storageKey(nucleusId), JSON.stringify(stored.filter(id => id !== personId)));
}

export function getUnplacedPersonIds(nucleusId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(nucleusId)) ?? '[]');
  } catch {
    return [];
  }
}
