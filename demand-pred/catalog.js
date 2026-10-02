'use strict';
/* What Grandma buys, and how much of it goes into one of each menu item.
   pack is one purchase in base units (g, ml or each), price is CAD, keeps is days it stays good once bought.
   These are sample figures: change them to match her suppliers and recipes. */
const INGREDIENTS = [
  { id: 'butter', name: 'Unsalted butter', aisle: 'Dairy & eggs', unit: 'g', pack: 454, packName: '1 lb block', price: 6.5, keeps: 30 },
  { id: 'milk', name: 'Whole milk', aisle: 'Dairy & eggs', unit: 'ml', pack: 4000, packName: '4 L jug', price: 6.8, keeps: 10 },
  { id: 'cream', name: 'Whipping cream 35%', aisle: 'Dairy & eggs', unit: 'ml', pack: 1000, packName: '1 L carton', price: 7.5, keeps: 10 },
  { id: 'mascarpone', name: 'Mascarpone', aisle: 'Dairy & eggs', unit: 'g', pack: 475, packName: '475 g tub', price: 8, keeps: 14 },
  { id: 'eggs', name: 'Eggs', aisle: 'Dairy & eggs', unit: 'each', pack: 30, packName: 'flat of 30', price: 12, keeps: 28 },
  { id: 'straw', name: 'Fresh strawberries', aisle: 'Fruit', unit: 'g', pack: 908, packName: '2 lb clamshell', price: 8, keeps: 4 },
  { id: 'mango', name: 'Frozen mango chunks', aisle: 'Fruit', unit: 'g', pack: 1500, packName: '1.5 kg bag', price: 9, keeps: 90 },
  { id: 'passion', name: 'Passionfruit purée', aisle: 'Fruit', unit: 'g', pack: 1000, packName: '1 kg frozen tub', price: 14, keeps: 90 },
  { id: 'yuzu', name: 'Yuzu juice', aisle: 'Fruit', unit: 'ml', pack: 250, packName: '250 ml bottle', price: 13, keeps: 60 },
  { id: 'flour', name: 'All-purpose flour', aisle: 'Dry goods', unit: 'g', pack: 10000, packName: '10 kg bag', price: 19, keeps: 180 },
  { id: 'sugar', name: 'White sugar', aisle: 'Dry goods', unit: 'g', pack: 2000, packName: '2 kg bag', price: 4.5, keeps: 365 },
  { id: 'almond', name: 'Almond flour', aisle: 'Dry goods', unit: 'g', pack: 1000, packName: '1 kg bag', price: 16, keeps: 90 },
  { id: 'granola', name: 'Granola crumble', aisle: 'Dry goods', unit: 'g', pack: 1000, packName: '1 kg bag', price: 9, keeps: 60 },
  { id: 'choc', name: 'Dark chocolate', aisle: 'Dry goods', unit: 'g', pack: 1000, packName: '1 kg callets', price: 18, keeps: 180 },
  { id: 'hazel', name: 'Hazelnut spread', aisle: 'Dry goods', unit: 'g', pack: 1000, packName: '1 kg jar', price: 15, keeps: 90 },
  { id: 'cocoa', name: 'Cocoa powder', aisle: 'Dry goods', unit: 'g', pack: 500, packName: '500 g tin', price: 8, keeps: 365 },
  { id: 'bean', name: 'Sweet red bean paste', aisle: 'Dry goods', unit: 'g', pack: 500, packName: '500 g pouch', price: 6, keeps: 60 },
  { id: 'lady', name: 'Ladyfingers', aisle: 'Dry goods', unit: 'g', pack: 400, packName: '400 g box', price: 6, keeps: 90 },
  { id: 'vanilla', name: 'Vanilla extract', aisle: 'Dry goods', unit: 'ml', pack: 118, packName: '118 ml bottle', price: 14, keeps: 365 },
  { id: 'matcha', name: 'Matcha powder', aisle: 'Tea & coffee', unit: 'g', pack: 100, packName: '100 g tin', price: 22, keeps: 60 },
  { id: 'coffee', name: 'Espresso beans', aisle: 'Tea & coffee', unit: 'g', pack: 1000, packName: '1 kg bag', price: 28, keeps: 30 },
  { id: 'hojicha', name: 'Hojicha leaves', aisle: 'Tea & coffee', unit: 'g', pack: 200, packName: '200 g bag', price: 16, keeps: 90 },
  { id: 'soda', name: 'Sparkling water', aisle: 'Tea & coffee', unit: 'each', pack: 24, packName: 'case of 24 cans', price: 11, keeps: 365 },
  { id: 'pcup', name: 'Parfait cups with lids', aisle: 'Packaging', unit: 'each', pack: 100, packName: 'sleeve of 100', price: 18, keeps: 999 },
  { id: 'dcup', name: 'Hot cups with lids', aisle: 'Packaging', unit: 'each', pack: 100, packName: 'sleeve of 100', price: 12, keeps: 999 },
];

/* the till's menu, keyed by the item_id it writes to sale_lines. madeAhead items are baked to a daily plan; the rest are made to order */
const ITEMS = {
  p_straw: { name: 'Strawberry Shortcake Parfait', madeAhead: true },
  p_matcha: { name: 'Matcha Red Bean Parfait', madeAhead: true },
  p_choc: { name: 'Chocolate Hazelnut Parfait', madeAhead: true },
  p_mango: { name: 'Mango Passionfruit Parfait', madeAhead: true },
  p_yuzu: { name: 'Lemon Yuzu Parfait', madeAhead: true },
  p_tira: { name: 'Tiramisu Parfait', madeAhead: true },
  croissant: { name: 'Butter Croissant', madeAhead: true },
  almond: { name: 'Almond Croissant', madeAhead: true },
  puff: { name: 'Vanilla Cream Puff', madeAhead: true },
  flan: { name: 'Caramel Flan', madeAhead: true },
  macaron: { name: 'Macaron Trio', madeAhead: true },
  latte: { name: 'Café Latte', madeAhead: false },
  tea: { name: 'Hojicha Tea', madeAhead: false },
  soda: { name: 'Yuzu Soda', madeAhead: false },
};

/* per one unit sold, keyed by the till's menu item id */
const RECIPES = {
  p_straw: { straw: 80, cream: 60, sugar: 15, flour: 20, butter: 6, eggs: .25, pcup: 1 },
  p_matcha: { matcha: 3, bean: 50, cream: 60, milk: 40, sugar: 12, granola: 20, pcup: 1 },
  p_choc: { choc: 30, hazel: 25, cocoa: 3, cream: 60, granola: 20, pcup: 1 },
  p_mango: { mango: 90, passion: 25, cream: 50, sugar: 10, granola: 20, pcup: 1 },
  p_yuzu: { yuzu: 15, eggs: .5, sugar: 25, butter: 10, cream: 50, granola: 20, pcup: 1 },
  p_tira: { mascarpone: 50, lady: 30, coffee: 8, cocoa: 3, sugar: 15, eggs: .25, cream: 30, pcup: 1 },
  croissant: { flour: 60, butter: 35, milk: 20, sugar: 6, eggs: .1 },
  almond: { flour: 60, butter: 45, almond: 30, sugar: 20, eggs: .3, milk: 20 },
  puff: { flour: 20, butter: 15, eggs: .6, milk: 60, cream: 30, sugar: 15, vanilla: 1 },
  flan: { eggs: 1, milk: 120, cream: 20, sugar: 35, vanilla: 1 },
  macaron: { almond: 30, sugar: 45, eggs: .4, butter: 10, choc: 5 },
  latte: { coffee: 18, milk: 220, dcup: 1 },
  tea: { hojicha: 4, dcup: 1 },
  soda: { yuzu: 20, sugar: 15, soda: 1 },
};

module.exports = { ITEMS, INGREDIENTS, ING: Object.fromEntries(INGREDIENTS.map(g => [g.id, g])), RECIPES };
