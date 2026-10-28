/**
 * Надёжная запись в хранилище после старта.
 * - пишет по очереди (последнее значение побеждает, старое не перезапишет новое);
 * - при сбое повторяет (паузы delays), а если не вышло — держит значение и пробует при следующей записи / flush();
 * - не пишет «пустое/битое» состояние (validate) и ничего не пишет, пока запись заблокирована
 *   (например, хранилище не прочиталось на старте — чтобы не затереть настоящие данные стартовыми).
 */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function createWriter({ setItem, key, validate = () => true, delays = [300, 1000], onError = () => {}, sleep = wait }) {
  let pending; // значение, которое ещё не записано (undefined — нечего)
  let busy = null;
  let blocked = false;
  let failed = false;

  async function run() {
    while (pending !== undefined && !blocked) {
      const v = pending;
      pending = undefined;
      let ok = false;
      for (let i = 0; i <= delays.length; i++) {
        try {
          await setItem(key, JSON.stringify(v));
          ok = true;
          break;
        } catch {
          if (i < delays.length) await sleep(delays[i]);
        }
      }
      if (!ok) {
        if (pending === undefined) pending = v; // не потерять: запишем при следующей попытке
        failed = true;
        onError('write');
        return;
      }
      failed = false;
    }
  }

  function kick() {
    if (busy) return busy;
    busy = run().finally(() => {
      busy = null;
    });
    return busy;
  }

  return {
    /** Запланировать запись. false — значение отклонено (битое) или запись заблокирована. */
    write(value) {
      if (!validate(value)) {
        onError('invalid');
        return false;
      }
      if (blocked) return false;
      pending = value;
      kick();
      return true;
    },
    /** Повторить незаписанное (например, при уходе приложения в фон). */
    flush() {
      return pending !== undefined && !blocked ? kick() : busy || Promise.resolve();
    },
    block(b = true) {
      blocked = !!b;
      if (!blocked && pending !== undefined) kick();
    },
    get blocked() {
      return blocked;
    },
    get failed() {
      return failed;
    },
    get hasPending() {
      return pending !== undefined;
    },
  };
}

/** Состояние «Расходов/Смен» можно писать: объект с массивами расходов и смен. */
export const validAppState = (s) =>
  !!s && typeof s === 'object' && !Array.isArray(s) && Array.isArray(s.expenses) && Array.isArray(s.shifts);

/** Расчёт можно писать: объект с days-объектом. */
export const validCalcState = (c) => !!c && typeof c === 'object' && !!c.days && typeof c.days === 'object';
