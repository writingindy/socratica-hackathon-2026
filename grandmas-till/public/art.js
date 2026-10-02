/* ---------- menu art: one small ink drawing per item, in the dashboard's outlined style ----------
   Every drawing is on a 64 × 64 grid. Parfaits share one glass and are filled with the item's own layer
   colours from MENU, so a new parfait gets a drawing for free. Add a case to ART for any other new item. */
const ART_INK = 'stroke="#171713" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';
const steam = xs => xs.map(x => `<path d="M${x} 16q-3-3 0-6t0-6" fill="none" ${ART_INK}/>`).join('');

function parfaitArt(it) {
  const [l1, l2, l3, l4] = it.layers, id = 'pg-' + it.id;
  const bowl = 'M17 14H47L43 42Q32 49 21 42Z';
  return `<defs><clipPath id="${id}"><path d="${bowl}"/></clipPath></defs>
    <g clip-path="url(#${id})"><rect x="10" y="35" width="44" height="16" fill="${l1}"/><rect x="10" y="28" width="44" height="7" fill="${l2}"/><rect x="10" y="21" width="44" height="7" fill="${l3}"/><rect x="10" y="14" width="44" height="7" fill="${l4}"/></g>
    <path d="M17 14Q20 7 27 9Q32 4 37 9Q44 7 47 14Z" fill="#fffaf1" ${ART_INK}/>
    <circle cx="35" cy="6" r="3.6" fill="${l3}" ${ART_INK}/><path d="M35 2.5q2-3 5-2" fill="none" ${ART_INK}/>
    <path d="${bowl}" fill="none" ${ART_INK}/><path d="M32 47V55M23 58Q32 54 41 58Z" fill="#fffaf1" ${ART_INK}/>`;
}
function croissantArt(fill, extra) {
  const lobe = (cx, cy, rx, ry, rot) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="${fill}" ${ART_INK}/>`;
  return lobe(11, 42, 5, 7, -55) + lobe(53, 42, 5, 7, 55) + lobe(20, 36, 7, 10, -35) + lobe(44, 36, 7, 10, 35) + lobe(32, 32, 9, 13, 0) + (extra || '');
}
function macaron(x, y, c) {
  return `<rect x="${x}" y="${y + 9}" width="24" height="7" rx="3.5" fill="${c}" ${ART_INK}/><rect x="${x + 2}" y="${y + 6}" width="20" height="3.5" fill="#fffaf1" ${ART_INK}/><rect x="${x}" y="${y}" width="24" height="7" rx="3.5" fill="${c}" ${ART_INK}/>`;
}
const ART = {
  croissant: () => croissantArt('#e9b45f'),
  almond: () => croissantArt('#f0c77d', `<g fill="#fffaf1" ${ART_INK}><ellipse cx="27" cy="27" rx="3" ry="1.6" transform="rotate(-25 27 27)"/><ellipse cx="35" cy="24" rx="3" ry="1.6" transform="rotate(20 35 24)"/><ellipse cx="33" cy="33" rx="3" ry="1.6" transform="rotate(-10 33 33)"/><ellipse cx="44" cy="33" rx="3" ry="1.6" transform="rotate(30 44 33)"/><ellipse cx="20" cy="35" rx="3" ry="1.6" transform="rotate(-40 20 35)"/></g>`),
  puff: () => `<path d="M10 40Q10 54 32 54Q54 54 54 40Z" fill="#e0b46a" ${ART_INK}/>
    <path d="M10 40Q13 34 18 38Q22 32 27 37Q32 31 37 37Q42 32 46 38Q51 34 54 40Z" fill="#fffaf1" ${ART_INK}/>
    <path d="M13 35Q13 14 32 14Q51 14 51 35Q45 31 40 34Q36 29 32 33Q28 29 24 34Q19 31 13 35Z" fill="#e9c586" ${ART_INK}/>
    <g fill="#fffaf1"><circle cx="26" cy="21" r="1.4"/><circle cx="33" cy="19" r="1.4"/><circle cx="39" cy="23" r="1.4"/><circle cx="30" cy="26" r="1.4"/></g>`,
  flan: () => `<ellipse cx="32" cy="53" rx="25" ry="5" fill="#fffaf1" ${ART_INK}/>
    <path d="M13 51L19 24H45L51 51Q32 56 13 51Z" fill="#f3d27a" ${ART_INK}/>
    <path d="M19 24H45L44 30Q42 35 40 30Q37 37 34 31Q30 38 27 31Q24 36 21 30Z" fill="#8a4a1c" ${ART_INK}/>
    <ellipse cx="32" cy="24" rx="13" ry="3" fill="#a85c24" ${ART_INK}/>`,
  macaron: () => macaron(5, 38, '#b9d99a') + macaron(35, 38, '#f6e08a') + macaron(20, 18, '#f2a7b8'),
  latte: () => steam([25, 33]) + `<ellipse cx="30" cy="53" rx="23" ry="5" fill="#fffaf1" ${ART_INK}/>
    <path d="M45 30q10 0 10 7t-10 7" fill="none" ${ART_INK}/>
    <path d="M13 25H47V38Q47 51 30 51Q13 51 13 38Z" fill="#fffaf1" ${ART_INK}/>
    <ellipse cx="30" cy="25" rx="17" ry="4.5" fill="#b98a63" ${ART_INK}/>
    <path d="M30 28q-5-3-4-5.5q1.5-2 4 .5q2.5-2.5 4-.5q1 2.5-4 5.5Z" fill="#fffaf1"/>`,
  tea: () => steam([26, 34]) + `<path d="M17 22H45L42 50Q31 54 20 50Z" fill="#a9cdeb" ${ART_INK}/>
    <ellipse cx="31" cy="22" rx="14" ry="3.5" fill="#9c6535" ${ART_INK}/>
    <path d="M24 42q2-9 11-10q-1 9-11 10Z" fill="#1d7338" ${ART_INK}/><path d="M24 42l7-6" fill="none" stroke="#fffaf1" stroke-width="1.4" stroke-linecap="round"/>`,
  soda: () => `<path d="M38 3L32 44" fill="none" stroke="#171713" stroke-width="6" stroke-linecap="round"/><path d="M38 3L32 44" fill="none" stroke="#f24b35" stroke-width="3" stroke-linecap="round"/>
    <path d="M19 14L22 56H42L45 14Z" fill="#fffaf1" ${ART_INK}/>
    <path d="M19.8 24L22 56H42L44.2 24Z" fill="#f6e08a" ${ART_INK}/>
    <g fill="#fffaf1" ${ART_INK} stroke-width="1.4"><circle cx="28" cy="46" r="2"/><circle cx="35" cy="38" r="1.6"/><circle cx="27" cy="33" r="1.4"/><circle cx="37" cy="49" r="1.4"/></g>
    <circle cx="46" cy="15" r="8" fill="#f4e27a" ${ART_INK}/><circle cx="46" cy="15" r="5" fill="#f9efae"/><path d="M46 10V20M41 15H51M42.5 11.5l7 7M49.5 11.5l-7 7" fill="none" stroke="#e9c93a" stroke-width="1.2"/>`,
};
function menuArt(it) {
  const body = it.cat === 'Parfaits' ? parfaitArt(it) : ART[it.id] ? ART[it.id]() : `<text x="32" y="44" text-anchor="middle" font-family="Patrick Hand, cursive" font-size="40">${it.name.charAt(0)}</text>`;
  return `<svg class="art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${body}</svg>`;
}
