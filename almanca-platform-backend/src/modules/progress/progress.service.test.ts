import { describe, expect, it } from 'vitest';
import { computeMaterialStates, type BookingForState, type TopicForState } from './progress.service';

// 1..N sıralı materyal listesi üretmek için küçük yardımcı
function topics(count: number): TopicForState[] {
  return Array.from({ length: count }, (_, i) => ({ id: `t${i + 1}`, sequenceOrder: i + 1 }));
}

function stateOf(states: ReturnType<typeof computeMaterialStates>, topicId: string) {
  return states.find((s) => s.topicId === topicId)?.state;
}

describe('computeMaterialStates', () => {
  it('iptal edilen ders COMPLETED sayılmaz — materyal NEXT olarak kalır', () => {
    const bookings: BookingForState[] = [{ topicId: 't1', status: 'CANCELLED', isReview: false }];
    const states = computeMaterialStates(topics(5), bookings, 1);
    expect(stateOf(states, 't1')).toBe('NEXT');
  });

  it('gerçekten tamamlanmış (isReview=false, status=COMPLETED) materyal COMPLETED olur, sıradaki NEXT olur', () => {
    const bookings: BookingForState[] = [{ topicId: 't1', status: 'COMPLETED', isReview: false }];
    const states = computeMaterialStates(topics(5), bookings, 1);
    expect(stateOf(states, 't1')).toBe('COMPLETED');
    expect(stateOf(states, 't2')).toBe('NEXT');
    expect(stateOf(states, 't3')).toBe('LOCKED');
  });

  it('admin startSequenceOrder=10 atadığında, altında hiçbir şey yokken NEXT sequenceOrder=10 olan materyaldir', () => {
    const states = computeMaterialStates(topics(12), [], 10);
    for (let i = 1; i <= 9; i++) expect(stateOf(states, `t${i}`)).toBe('EXEMPT');
    expect(stateOf(states, 't10')).toBe('NEXT');
    expect(stateOf(states, 't11')).toBe('LOCKED');
    expect(stateOf(states, 't12')).toBe('LOCKED');
  });

  it('zincirleme SCHEDULED dersler NEXT’i doğru ileri kaydırır', () => {
    const bookings: BookingForState[] = [
      { topicId: 't1', status: 'SCHEDULED', isReview: false },
      { topicId: 't2', status: 'SCHEDULED', isReview: false },
    ];
    const states = computeMaterialStates(topics(5), bookings, 1);
    expect(stateOf(states, 't1')).toBe('SCHEDULED');
    expect(stateOf(states, 't2')).toBe('SCHEDULED');
    expect(stateOf(states, 't3')).toBe('NEXT');
    expect(stateOf(states, 't4')).toBe('LOCKED');
    expect(stateOf(states, 't5')).toBe('LOCKED');
  });

  it('tekrar dersleri (isReview=true) ilerlemeyi hiçbir şekilde etkilemez', () => {
    const bookings: BookingForState[] = [
      { topicId: 't1', status: 'COMPLETED', isReview: true },
      { topicId: 't1', status: 'SCHEDULED', isReview: true },
    ];
    const states = computeMaterialStates(topics(3), bookings, 1);
    // isReview=true kayıtlar sayılmadığı için t1 hâlâ hiçbir "gerçek" ilerleme kümesinde değil → NEXT
    expect(stateOf(states, 't1')).toBe('NEXT');
    expect(stateOf(states, 't2')).toBe('LOCKED');
  });

  it('EXEMPT materyal de tekrar dersiyle SCHEDULED görünmez — isReview olmayan ders EXEMPT bölgesinde de ilerlemeyi etkiler', () => {
    // startSequenceOrder=3: t1,t2 EXEMPT. t1 için isReview=true bir SCHEDULED ders olsa da t1 EXEMPT kalmalı.
    const bookings: BookingForState[] = [{ topicId: 't1', status: 'SCHEDULED', isReview: true }];
    const states = computeMaterialStates(topics(5), bookings, 3);
    expect(stateOf(states, 't1')).toBe('EXEMPT');
    expect(stateOf(states, 't2')).toBe('EXEMPT');
    expect(stateOf(states, 't3')).toBe('NEXT');
  });

  it('hiç materyal yoksa boş dizi döner', () => {
    expect(computeMaterialStates([], [], 1)).toEqual([]);
  });

  it('tüm materyaller tamamlanmışsa NEXT hiç atanmaz, hepsi COMPLETED olur', () => {
    const bookings: BookingForState[] = [
      { topicId: 't1', status: 'COMPLETED', isReview: false },
      { topicId: 't2', status: 'COMPLETED', isReview: false },
    ];
    const states = computeMaterialStates(topics(2), bookings, 1);
    expect(stateOf(states, 't1')).toBe('COMPLETED');
    expect(stateOf(states, 't2')).toBe('COMPLETED');
    expect(states.some((s) => s.state === 'NEXT')).toBe(false);
  });
});
