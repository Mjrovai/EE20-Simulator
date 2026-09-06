/* EE20 Simulator — shared part catalogue, colour code, Morse table, melodies */
window.EE20 = window.EE20 || {};

(function (EE) {
  'use strict';

  // ---- Resistor colour code -------------------------------------------------
  const BAND_COLORS = ['#111', '#7b4a20', '#d92b2b', '#f28c1e', '#f2d21e', '#2e9e3a', '#2d63c9', '#8a3fb0', '#8d8d8d', '#f5f5f5'];
  const BAND_NAMES = {
    en: ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'],
    pt: ['preto', 'marrom', 'vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'violeta', 'cinza', 'branco'],
  };

  function resistorBands(ohms) {
    // returns [d1, d2, multiplier] digits
    if (ohms < 10) return [0, Math.round(ohms), 0];
    let mult = 0, v = ohms;
    while (v >= 100) { v /= 10; mult++; }
    v = Math.round(v);
    return [Math.floor(v / 10), v % 10, mult];
  }

  function fmtOhms(ohms, lang) {
    if (ohms >= 1e6) return (ohms / 1e6).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-GB') + ' MΩ';
    if (ohms >= 1000) return (ohms / 1000).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-GB') + ' kΩ';
    return ohms + ' Ω';
  }
  function fmtOhmsLong(ohms) {
    // manual style: 680 000 Ω
    return ohms.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Ω';
  }
  function fmtFarads(f, lang) {
    const loc = lang === 'pt' ? 'pt-BR' : 'en-GB';
    if (f >= 0.1e-6 - 1e-12) return (Math.round(f * 1e7) / 10).toLocaleString(loc) + ' µF';
    return Math.round(f * 1e12).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' pF';
  }

  // ---- Part catalogue (what is in the EE8 + EE20 box) -----------------------
  const CATALOG = {
    R: { en: 'Carbon resistor', pt: 'Resistor de carvão' },
    C: { en: 'Polyester capacitor', pt: 'Capacitor de poliéster' },
    CE: { en: 'Electrolytic capacitor', pt: 'Capacitor eletrolítico' },
    T_AF116: { en: 'Transistor AF 116 (PNP, germanium, RF)', pt: 'Transistor AF 116 (PNP, germânio, RF)' },
    T_AC126: { en: 'Transistor AC 126 (PNP, germanium, AF) with heat sink', pt: 'Transistor AC 126 (PNP, germânio, AF) com dissipador' },
    D: { en: 'Diode OA 79', pt: 'Diodo OA 79' },
    LDR: { en: 'Light dependent resistor (LDR)', pt: 'Fotorresistor (LDR)' },
    LAMP: { en: 'Lamp 6 V / 0.05 A in holder', pt: 'Lâmpada 6 V / 0,05 A com soquete' },
    POT: { en: 'Potentiometer 10 kΩ log. with on/off switch', pt: 'Potenciômetro 10 kΩ log. com interruptor' },
    VC: { en: 'Tuning capacitor (variable)', pt: 'Capacitor variável de sintonia' },
    SLIDE: { en: 'Sliding switch', pt: 'Chave deslizante' },
    KEY: { en: 'Key (spring contact)', pt: 'Tecla (contato de mola)' },
    MORSE: { en: 'Morse key', pt: 'Manipulador Morse' },
    SPK: { en: 'Loudspeaker', pt: 'Alto-falante' },
    SPK2: { en: 'Second loudspeaker (external)', pt: 'Segundo alto-falante (externo)' },
    EAR: { en: 'Crystal earphone', pt: 'Fone de ouvido de cristal' },
    BAT: { en: '2 × 4.5 V flat batteries (9 V)', pt: '2 pilhas planas de 4,5 V (9 V)' },
    COIL: { en: 'Aerial coil on ferroxcube rod', pt: 'Bobina de antena em bastão de ferroxcube' },
    CHOKE: { en: 'Choke (pick-up coil)', pt: 'Bobina de choque (bobina captadora)' },
    PU: { en: 'Record player (pick-up)', pt: 'Toca-discos (pick-up)' },
    MIC: { en: 'Earphone used as microphone', pt: 'Fone usado como microfone' },
  };

  // ---- Morse -----------------------------------------------------------------
  const MORSE = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
    N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
    0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '=': '-...-',
  };
  const MORSE_REV = {};
  Object.keys(MORSE).forEach(k => { MORSE_REV[MORSE[k]] = k; });

  // ---- Public-domain melodies (note, beats) ---------------------------------
  // note names -> frequency
  const NOTE = (() => {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const map = {};
    for (let o = 2; o <= 6; o++) names.forEach((n, i) => { map[n + o] = 440 * Math.pow(2, (o - 4) + (i - 9) / 12); });
    map.R = 0; return map;
  })();

  const MELODIES = {
    odeToJoy: { title: { en: 'Ode to Joy (Beethoven)', pt: 'Ode à Alegria (Beethoven)' }, bpm: 112, notes: [
      ['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1.5], ['D4', .5], ['D4', 2],
      ['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['D4', 1.5], ['C4', .5], ['C4', 2], ['R', 1]] },
    greensleeves: { title: { en: 'Greensleeves (trad.)', pt: 'Greensleeves (trad.)' }, bpm: 130, notes: [
      ['A3', 1], ['C4', 2], ['D4', 1], ['E4', 1.5], ['F4', .5], ['E4', 1], ['D4', 2], ['B3', 1], ['G3', 1.5], ['A3', .5], ['B3', 1], ['C4', 2], ['A3', 1], ['A3', 1.5], ['G#3', .5], ['A3', 1], ['B3', 2], ['G#3', 1], ['E3', 2],
      ['A3', 1], ['C4', 2], ['D4', 1], ['E4', 1.5], ['F4', .5], ['E4', 1], ['D4', 2], ['B3', 1], ['G3', 1.5], ['A3', .5], ['B3', 1], ['C4', 1.5], ['B3', .5], ['A3', 1], ['G#3', 1.5], ['F#3', .5], ['G#3', 1], ['A3', 3], ['R', 1]] },
    ciranda: { title: { en: 'Ciranda, cirandinha (Brazilian folk)', pt: 'Ciranda, cirandinha (folclore)' }, bpm: 120, notes: [
      ['G4', 1], ['E4', 1], ['E4', 1], ['F4', 1], ['D4', 1], ['D4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['G4', 1], ['R', 1],
      ['G4', 1], ['E4', 1], ['E4', 1], ['F4', 1], ['D4', 1], ['D4', 1], ['C4', 1], ['E4', 1], ['G4', 1], ['G4', 1], ['C4', 2], ['R', 2]] },
    frere: { title: { en: 'Frère Jacques (trad.)', pt: 'Frère Jacques (trad.)' }, bpm: 120, notes: [
      ['C4', 1], ['D4', 1], ['E4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['C4', 1], ['E4', 1], ['F4', 1], ['G4', 2], ['E4', 1], ['F4', 1], ['G4', 2],
      ['G4', .5], ['A4', .5], ['G4', .5], ['F4', .5], ['E4', 1], ['C4', 1], ['G4', .5], ['A4', .5], ['G4', .5], ['F4', .5], ['E4', 1], ['C4', 1], ['C4', 1], ['G3', 1], ['C4', 2], ['C4', 1], ['G3', 1], ['C4', 2], ['R', 2]] },
    caiCai: { title: { en: 'Cai, cai balão (Brazilian folk)', pt: 'Cai, cai balão (folclore)' }, bpm: 126, notes: [
      ['E4', 1], ['E4', 1], ['C4', 1], ['E4', 1], ['G4', 1], ['G4', 1], ['E4', 2], ['E4', 1], ['E4', 1], ['C4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['D4', 2],
      ['D4', 1], ['D4', 1], ['B3', 1], ['D4', 1], ['F4', 1], ['F4', 1], ['D4', 2], ['D4', 1], ['D4', 1], ['B3', 1], ['D4', 1], ['C4', 1], ['C4', 1], ['C4', 2], ['R', 2]] },
  };

  // Organ scale (doh ray me fah soh lah te doh) in semitones from the tonic
  const SCALE = [0, 2, 4, 5, 7, 9, 11, 12];

  EE.parts = { BAND_COLORS, BAND_NAMES, resistorBands, fmtOhms, fmtOhmsLong, fmtFarads, CATALOG, MORSE, MORSE_REV, NOTE, MELODIES, SCALE };
})(window.EE20);
