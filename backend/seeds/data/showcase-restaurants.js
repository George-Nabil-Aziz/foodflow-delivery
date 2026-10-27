/**
 * Showcase restaurants: enough of a marketplace that browsing, filtering and
 * pagination have something to work with.
 *
 * 96 restaurants across ten cuisines in Cairo and Giza, each with its own
 * owner account, open all week and with a two-category menu priced in
 * Egyptian pounds. Together with the four customer-visible restaurants in the
 * main seed that makes 100 on the listing.
 *
 * Everything is derived from the tables below by position, so every run of
 * the seed produces the same names, slugs, coordinates and prices.
 *
 * No rating is written here. A rating is computed from published reviews of
 * delivered orders - the seed's order history gives some of them reviews -
 * since writing a number straight into rating_average would show "4.6 (23)"
 * over a review list that is empty.
 */

const NAMES = {
  EGYPTIAN: ['Koshary Corner', 'Feteer House', 'Ful & Taameya', 'Hawawshi Hub', 'Nile Grill',
    'Molokhia Kitchen', 'Fatta & Co', 'Mahshi Mama', 'Baladi Bites', 'Sayadeya Bay'],
  LEVANTINE: ['Cedar House', 'Zaatar & Co', 'Hummus Corner', 'Damascus Gate', 'Shawarma Street',
    'Falafel Brothers', 'The Olive Branch', 'Beirut Nights', 'Manakish Oven', 'Jasmine Table'],
  ITALIAN: ['Trattoria Roma', 'Basil & Burrata', 'Napoli Express', 'La Piazza', 'Pizza Fornace',
    'Il Gusto', 'Mamma Rosa', 'Risotto Bar', 'Gnocchi Lab', 'Little Sicily'],
  INDIAN: ['Saffron Spice', 'Masala Junction', 'Tandoor Nights', 'Bombay Bites', 'Curry Leaf',
    'Delhi Darbar', 'Biryani House', 'Chai & Chaat', 'Goa Coast', 'Punjab Grill'],
  BURGERS: ['Smash Bros', 'Patty Wagon', 'Bun Republic', 'Grill Masters', 'The Burger Joint',
    'Stack Shack', 'Flame & Bun', 'Double Decker', 'Prime Patty', 'Cheese Melt'],
  SEAFOOD: ['Red Sea Catch', 'Harbour Grill', 'Pearl Fishery', 'Shrimp Shack', 'Alexandria Fish House',
    'Ocean Table', 'Catch of the Day', 'Coral Kitchen', 'Lobster Pot', 'Salt & Sea'],
  ASIAN: ['Tokyo Ramen', 'Wok This Way', 'Seoul Kitchen', 'Bangkok Street', 'Dim Sum Garden',
    'Sushi Wave', 'Pho Saigon', 'Dragon Noodle', 'Bao House', 'Bamboo Bowl'],
  DESSERTS: ['Sugar Rush', 'Kunafa Palace', 'Om Ali Sweets', 'Cake Studio', 'Gelato Bar',
    'Waffle House', 'Choco Lab', 'Basbousa Bar', 'Cheesecake Co', 'Crepe Corner'],
  COFFEE: ['Bean There', 'Morning Brew', 'Arabica Lounge', 'Cold Drip', 'Roast & Toast',
    'Espresso Lane', 'The Daily Grind', 'Latte Art', 'Cardamom Coffee'],
  HEALTHY: ['Green Bowl', 'Fresh Press', 'Salad Studio', 'Fit Kitchen', 'Acai Island',
    'Protein Box', 'Leaf & Grain', 'Vital Plate', 'Pure Eats'],
};

/** Two categories, three dishes each, in pounds: [category, [[name, description, price], ...]]. */
const MENUS = {
  EGYPTIAN: [['Mains', [['Koshary', 'Rice, lentils, pasta, spiced tomato sauce, crispy onions.', '65.00'],
    ['Hawawshi', 'Spiced minced beef baked in baladi bread.', '95.00'],
    ['Molokhia & Chicken', 'Garlic molokhia, roast chicken, vermicelli rice.', '185.00']]],
  ['Breakfast', [['Ful Medames', 'Slow-cooked fava beans, olive oil, cumin.', '35.00'],
    ['Taameya', 'Herb falafel with tahini.', '30.00'],
    ['Feteer Meshaltet', 'Flaky layered pastry, honey and cheese.', '120.00']]]],
  LEVANTINE: [['Grills', [['Chicken Shish Tawook', 'Marinated chicken skewers, garlic sauce.', '230.00'],
    ['Kofta Platter', 'Spiced lamb kofta, grilled tomato, rice.', '265.00'],
    ['Mixed Shawarma Plate', 'Chicken and beef, pickles, fries.', '215.00']]],
  ['Mezze', [['Hummus', 'Chickpeas, tahini, olive oil.', '90.00'],
    ['Fattoush', 'Crisp pita, sumac, garden vegetables.', '105.00'],
    ['Moutabal', 'Smoked aubergine with tahini.', '95.00']]]],
  ITALIAN: [['Pizza', [['Margherita', 'Tomato, fior di latte, basil.', '210.00'],
    ['Diavola', 'Spicy beef salami, chilli oil.', '255.00'],
    ['Quattro Formaggi', 'Four cheeses, honey drizzle.', '270.00']]],
  ['Pasta', [['Spaghetti Bolognese', 'Slow-cooked beef ragu.', '240.00'],
    ['Fettuccine Alfredo', 'Parmesan cream, black pepper.', '230.00'],
    ['Penne Pesto', 'Basil pesto, pine nuts.', '215.00']]]],
  INDIAN: [['Curries', [['Butter Chicken', 'Tomato and cream curry.', '285.00'],
    ['Lamb Rogan Josh', 'Kashmiri chilli, slow-cooked lamb.', '320.00'],
    ['Palak Paneer', 'Spinach and cottage cheese.', '210.00']]],
  ['Rice & Bread', [['Chicken Biryani', 'Basmati, saffron, fried onion.', '270.00'],
    ['Garlic Naan', 'From the tandoor.', '45.00'],
    ['Jeera Rice', 'Cumin-tempered basmati.', '65.00']]]],
  BURGERS: [['Burgers', [['Classic Smash', 'Two patties, cheese, house sauce.', '200.00'],
    ['Mushroom Swiss', 'Sautéed mushrooms, Swiss cheese.', '225.00'],
    ['Crispy Chicken', 'Buttermilk chicken, slaw, pickles.', '185.00']]],
  ['Sides', [['Fries', 'Skin-on, sea salt.', '65.00'],
    ['Onion Rings', 'Crisp batter.', '75.00'],
    ['Loaded Fries', 'Cheese sauce, jalapeños.', '105.00']]]],
  SEAFOOD: [['From the Grill', [['Grilled Sea Bass', 'Whole fish with rice.', '450.00'],
    ['Jumbo Shrimp', 'Garlic butter, lemon.', '410.00'],
    ['Salmon Fillet', 'Herb crust, greens.', '380.00']]],
  ['Fried', [['Fish & Chips', 'Crispy fillet, tartare.', '285.00'],
    ['Calamari', 'Lightly fried, aioli.', '210.00'],
    ['Shrimp Basket', 'With seafood sauce.', '245.00']]]],
  ASIAN: [['Noodles', [['Chicken Ramen', 'Rich broth, soft egg.', '240.00'],
    ['Pad Thai', 'Rice noodles, peanuts, lime.', '225.00'],
    ['Beef Udon', 'Thick noodles, soy broth.', '255.00']]],
  ['Small Plates', [['Chicken Gyoza', 'Pan-fried dumplings.', '130.00'],
    ['Spring Rolls', 'Vegetable, sweet chilli.', '100.00'],
    ['Edamame', 'Sea salt.', '75.00']]]],
  DESSERTS: [['Oriental', [['Om Ali', 'Baked pastry, milk, nuts and raisins.', '95.00'],
    ['Pistachio Kunafa', 'Warm, with sugar syrup.', '185.00'],
    ['Basbousa', 'Semolina cake, coconut, syrup.', '70.00']]],
  ['Treats', [['Belgian Waffle', 'Berries and cream.', '145.00'],
    ['Gelato Trio', 'Three scoops, seasonal flavours.', '120.00'],
    ['Chocolate Fudge Cake', 'Dark chocolate, ganache.', '155.00']]]],
  COFFEE: [['Coffee', [['Spanish Latte', 'Sweetened condensed milk.', '105.00'],
    ['Flat White', 'Double ristretto.', '95.00'],
    ['Turkish Coffee', 'Fine-ground, brewed in a kanaka.', '55.00']]],
  ['Bakery', [['Butter Croissant', 'Baked this morning.', '65.00'],
    ['Banana Bread', 'Toasted, with butter.', '75.00'],
    ['Cinnamon Roll', 'Cream cheese glaze.', '90.00']]]],
  HEALTHY: [['Bowls', [['Chicken Quinoa Bowl', 'Grilled chicken, greens, tahini.', '230.00'],
    ['Salmon Poke', 'Brown rice, avocado, edamame.', '295.00'],
    ['Falafel Buddha Bowl', 'Hummus, pickles, greens.', '200.00']]],
  ['Juices', [['Green Detox', 'Spinach, apple, ginger.', '100.00'],
    ['Berry Blast', 'Mixed berries, banana.', '105.00'],
    ['Fresh Mango', 'Freshly pressed.', '85.00']]]],
};

/** [district, city, latitude, longitude] */
const DISTRICTS = [
  ['Zamalek', 'Cairo', 30.0626, 31.2197], ['Maadi', 'Cairo', 29.9602, 31.2569],
  ['Heliopolis', 'Cairo', 30.0911, 31.3225], ['Nasr City', 'Cairo', 30.0561, 31.3301],
  ['Dokki', 'Giza', 30.0384, 31.2123], ['Mohandessin', 'Giza', 30.0561, 31.2001],
  ['Garden City', 'Cairo', 30.0368, 31.2318], ['Downtown', 'Cairo', 30.0478, 31.2390],
  ['New Cairo', 'Cairo', 30.0074, 31.4913], ['Shubra', 'Cairo', 30.0866, 31.2441],
  ['Sheikh Zayed', 'Giza', 30.0444, 30.9826], ['6th of October', 'Giza', 29.9381, 30.9149],
];

const slugify = (name) => name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const money = (n) => n.toFixed(2);

/** Builds the 96 restaurants, interleaving cuisines so no page is one cuisine. */
export function showcaseRestaurants() {
  const cuisines = Object.keys(NAMES);
  const rows = [];
  for (let round = 0; rows.length < 96; round += 1) {
    for (const cuisine of cuisines) {
      const name = NAMES[cuisine][round];
      if (!name || rows.length >= 96) continue;
      const i = rows.length;
      const [district, city, lat, lng] = DISTRICTS[i % DISTRICTS.length];
      rows.push({
        name,
        slug: slugify(name),
        cuisine,
        district,
        city,
        // Spread within ~1.5 km of the district centre, deterministically.
        lat: Number((lat + (((i * 37) % 21) - 10) * 0.0015).toFixed(4)),
        lng: Number((lng + (((i * 53) % 21) - 10) * 0.0015).toFixed(4)),
        fee: money(15 + (i % 6) * 5),
        min: money(75 + (i % 5) * 25),
        prep: 15 + (i % 6) * 5,
        // A wide zone for most, so seeded customers can order almost anywhere
        // in Greater Cairo; every fourth is a small neighbourhood kitchen, so
        // the "does not deliver to your address" state is easy to find.
        radius: i % 4 === 3 ? 6 : 20,
        // One in twelve is paused, so "not accepting orders" shows up in the
        // listing as it would on a real evening.
        accepting: i % 12 !== 11,
        owner: `${slugify(name).replace(/-/g, '.')}@foodflow.com`,
        ownerName: `${name} Owner`,
        // Egyptian mobile numbers on the WE (015) prefix.
        phone: `+2015${String(40000000 + i)}`,
      });
    }
  }
  return rows;
}

export const menuFor = (cuisine) => MENUS[cuisine];
