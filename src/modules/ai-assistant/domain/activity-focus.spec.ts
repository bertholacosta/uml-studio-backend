import { activityFocus } from './activity-focus';

const ana = { userId: 'u1', userName: 'Ana Pérez' };
const marco = { userId: 'u2', userName: 'Marco Rojas' };
const marcela = { userId: 'u3', userName: 'Marcela Díaz' };
const members = [ana, marco, marcela];

describe('activityFocus', () => {
  it('reconoce de quién se habla por su nombre de pila', () => {
    const focus = activityFocus(
      '@Trazo revisa lo que hizo Marco',
      members,
      ana,
    );
    expect(focus.people).toEqual([marco]);
    expect(focus.aboutWork).toBe(true);
  });

  it('no confunde nombres que empiezan igual', () => {
    expect(activityFocus('¿qué cambió Marcela?', members, ana).people).toEqual([
      marcela,
    ]);
  });

  it('«lo que hice» es el trabajo de quien escribe', () => {
    const focus = activityFocus(
      'Trazo, revisa lo que hice en Pago',
      members,
      ana,
    );
    expect(focus.people).toEqual([ana]);
    expect(focus.aboutWork).toBe(true);
  });

  it('nombrar a alguien sin hablar de su trabajo no es una consulta de actividad', () => {
    const focus = activityFocus(
      'agrega email a Cliente como sugirió Marco',
      members,
      ana,
    );
    expect(focus.people).toEqual([marco]);
    expect(focus.aboutWork).toBe(false);
  });

  it('detecta cuando piden ponerse al día', () => {
    for (const text of [
      '¿Qué han avanzado?',
      'ponme al día',
      '¿qué hay de nuevo desde ayer?',
      'novedades?',
    ]) {
      expect(activityFocus(text, members, ana).catchUp).toBe(true);
    }
    expect(
      activityFocus('¿qué es una composición?', members, ana).catchUp,
    ).toBe(false);
  });
});
