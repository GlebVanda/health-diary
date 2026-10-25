// Мини-раннер тестов в браузере: describe / it / expect. Без зависимостей.
(function () {
  const suites = [];
  let current = null;

  window.describe = (name, fn) => {
    current = { name, tests: [] };
    suites.push(current);
    fn();
    current = null;
  };
  window.it = (name, fn) => current.tests.push({ name, fn });

  function fmt(v) {
    try {
      return JSON.stringify(v);
    } catch (e) {
      return String(v);
    }
  }

  window.expect = (actual) => ({
    toBe(exp) {
      if (actual !== exp) throw new Error(`ожидалось ${fmt(exp)}, получено ${fmt(actual)}`);
    },
    toEqual(exp) {
      if (fmt(actual) !== fmt(exp)) throw new Error(`ожидалось ${fmt(exp)}, получено ${fmt(actual)}`);
    },
    toBeCloseTo(exp, tol) {
      tol = tol == null ? 0.01 : tol;
      if (!(Math.abs(actual - exp) <= tol)) throw new Error(`ожидалось ≈${exp} (±${tol}), получено ${fmt(actual)}`);
    },
    toBeWithin(lo, hi) {
      if (!(actual >= lo && actual <= hi)) throw new Error(`ожидалось в [${lo}; ${hi}], получено ${fmt(actual)}`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(`ожидалось истинное значение, получено ${fmt(actual)}`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`ожидалось ложное значение, получено ${fmt(actual)}`);
    },
    toContain(x) {
      if (!actual || !actual.includes(x)) throw new Error(`${fmt(actual)} не содержит ${fmt(x)}`);
    },
    toBeNull() {
      if (actual !== null) throw new Error(`ожидалось null, получено ${fmt(actual)}`);
    },
  });

  window.runTests = async function () {
    const out = document.getElementById('out');
    let pass = 0;
    let fail = 0;
    const failures = [];
    let html = '';
    for (const s of suites) {
      html += `<h2>${s.name}</h2><ul>`;
      for (const t of s.tests) {
        try {
          await t.fn();
          pass++;
          html += `<li class="ok">✓ ${t.name}</li>`;
        } catch (e) {
          fail++;
          failures.push(`${s.name} › ${t.name}: ${e.message}`);
          html += `<li class="fail">✗ ${t.name}<div class="err">${String(e.message).replace(/</g, '&lt;')}</div></li>`;
        }
      }
      html += '</ul>';
    }
    out.innerHTML = `<div class="summary ${fail ? 'bad' : 'good'}">Пройдено: ${pass}, упало: ${fail}</div>` + html;
    window.__testResults = { pass, fail, failures };
    document.title = (fail ? '✗ ' : '✓ ') + `${pass}/${pass + fail} тестов`;
  };
})();
