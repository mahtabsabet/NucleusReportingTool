import { describe, it, expect } from 'vitest';
import { findDuplicateGroups, type DuplicateCandidate } from '../duplicates';

const p = (id: string, name: string, email?: string | null, phone?: string | null): DuplicateCandidate =>
  ({ id, name, email, phone });

describe('findDuplicateGroups', () => {
  it('returns no groups when everyone is distinct', () => {
    const groups = findDuplicateGroups([
      p('1', 'Alice Smith'),
      p('2', 'Bob Jones'),
      p('3', 'Carol White'),
    ]);
    expect(groups).toEqual([]);
  });

  it('groups people with the same name ignoring case and whitespace', () => {
    const groups = findDuplicateGroups([
      p('1', 'Sara Khan'),
      p('2', '  sara   khan '),
      p('3', 'Bob Jones'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].people.map(x => x.id).sort()).toEqual(['1', '2']);
    expect(groups[0].reasons).toEqual(['name']);
  });

  it('groups differently-named people who share an email', () => {
    const groups = findDuplicateGroups([
      p('1', 'Jonathan Doe', 'jd@example.com'),
      p('2', 'Jon Doe', 'JD@example.com'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].people.map(x => x.id).sort()).toEqual(['1', '2']);
    expect(groups[0].reasons).toEqual(['email']);
  });

  it('groups on phone number ignoring formatting', () => {
    const groups = findDuplicateGroups([
      p('1', 'A', null, '(555) 123-4567'),
      p('2', 'B', null, '5551234567'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reasons).toEqual(['phone']);
  });

  it('ignores too-short phone fragments', () => {
    const groups = findDuplicateGroups([
      p('1', 'A', null, '123'),
      p('2', 'B', null, '123'),
    ]);
    expect(groups).toEqual([]);
  });

  it('does not group on empty email/phone', () => {
    const groups = findDuplicateGroups([
      p('1', 'A', '', ''),
      p('2', 'B', '', ''),
    ]);
    expect(groups).toEqual([]);
  });

  it('merges transitively across signals into one group', () => {
    // 1↔2 by name, 2↔3 by phone → a single {1,2,3} group.
    const groups = findDuplicateGroups([
      p('1', 'Mary Poppins'),
      p('2', 'mary poppins', null, '555-000-1111'),
      p('3', 'Different Name', null, '5550001111'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].people.map(x => x.id).sort()).toEqual(['1', '2', '3']);
    expect(groups[0].reasons).toEqual(['name', 'phone']);
  });

  it('reports multiple independent groups, largest first', () => {
    const groups = findDuplicateGroups([
      p('1', 'Twin'),
      p('2', 'twin'),
      p('3', 'twin'),
      p('4', 'Pair'),
      p('5', 'pair'),
      p('6', 'Solo'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].people).toHaveLength(3);
    expect(groups[1].people).toHaveLength(2);
  });

  it('sorts people within a group by name', () => {
    const groups = findDuplicateGroups([
      p('1', 'Zoe Lee', 'shared@x.com'),
      p('2', 'Anna Lee', 'shared@x.com'),
    ]);
    expect(groups[0].people.map(x => x.name)).toEqual(['Anna Lee', 'Zoe Lee']);
  });
});
