import { describe, it, expect } from 'vitest';
import { DB_TO_APP_TYPE, APP_TO_DB_TYPE } from '../nucleus';

describe('DB_TO_APP_TYPE', () => {
  it('maps known DB values to app types', () => {
    expect(DB_TO_APP_TYPE['children_class']).toBe('children-class');
    expect(DB_TO_APP_TYPE['junior_youth']).toBe('junior-youth');
    expect(DB_TO_APP_TYPE['study_circle']).toBe('study-circle');
    expect(DB_TO_APP_TYPE['devotional']).toBe('devotional');
    expect(DB_TO_APP_TYPE['other']).toBe('other');
  });

  it('maps legacy fireside to other', () => {
    expect(DB_TO_APP_TYPE['fireside']).toBe('other');
  });

  it('returns undefined for unknown DB values', () => {
    expect(DB_TO_APP_TYPE['unknown_type']).toBeUndefined();
  });
});

describe('APP_TO_DB_TYPE', () => {
  it('maps app types to DB values', () => {
    expect(APP_TO_DB_TYPE['children-class']).toBe('children_class');
    expect(APP_TO_DB_TYPE['junior-youth']).toBe('junior_youth');
    expect(APP_TO_DB_TYPE['study-circle']).toBe('study_circle');
    expect(APP_TO_DB_TYPE['devotional']).toBe('devotional');
    expect(APP_TO_DB_TYPE['other']).toBe('other');
  });

  it('round-trips back to the original DB value', () => {
    const dbValues = ['children_class', 'junior_youth', 'study_circle', 'devotional', 'other'];
    for (const dbVal of dbValues) {
      const appType = DB_TO_APP_TYPE[dbVal];
      expect(APP_TO_DB_TYPE[appType]).toBe(dbVal);
    }
  });
});
