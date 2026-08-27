export type CityLocation = {
  name: string;
  latitude: number;
  longitude: number;
};

// Catalogue embarqué : aucune requête vers un service de géolocalisation n'est nécessaire.
const CITY_DATA: readonly (readonly [string, number, number])[] = [
  ['Paris', 48.8566, 2.3522], ['Marseille', 43.2965, 5.3698], ['Lyon', 45.764, 4.8357],
  ['Toulouse', 43.6047, 1.4442], ['Nice', 43.7102, 7.262], ['Nantes', 47.2184, -1.5536],
  ['Montpellier', 43.6119, 3.8772], ['Strasbourg', 48.5734, 7.7521], ['Bordeaux', 44.8378, -0.5792],
  ['Lille', 50.6292, 3.0573], ['Rennes', 48.1173, -1.6778], ['Reims', 49.2583, 4.0317],
  ['Saint-Étienne', 45.4397, 4.3872], ['Le Havre', 49.4944, 0.1079], ['Toulon', 43.1242, 5.928],
  ['Grenoble', 45.1885, 5.7245], ['Dijon', 47.322, 5.0415], ['Angers', 47.4784, -0.5632],
  ['Nîmes', 43.8367, 4.3601], ['Villeurbanne', 45.7719, 4.8902], ['Clermont-Ferrand', 45.7772, 3.087],
  ['Aix-en-Provence', 43.5297, 5.4474], ['Le Mans', 48.0061, 0.1996], ['Brest', 48.3904, -4.4861],
  ['Tours', 47.3941, 0.6848], ['Amiens', 49.8941, 2.2958], ['Limoges', 45.8336, 1.2611],
  ['Annecy', 45.8992, 6.1294], ['Perpignan', 42.6887, 2.8948], ['Metz', 49.1193, 6.1757],
  ['Besançon', 47.2378, 6.0241], ['Orléans', 47.903, 1.9093], ['Mulhouse', 47.7508, 7.3359],
  ['Rouen', 49.4432, 1.0993], ['Caen', 49.1829, -0.3707], ['Nancy', 48.6921, 6.1844],
  ['Argenteuil', 48.9472, 2.2467], ['Montreuil', 48.864, 2.443], ['Roubaix', 50.6927, 3.1778],
  ['Avignon', 43.9493, 4.8055], ['Poitiers', 46.5802, 0.3404], ['Dunkerque', 51.0344, 2.3768],
  ['La Rochelle', 46.1603, -1.1511], ['Béziers', 43.3442, 3.2158], ['Valence', 44.9334, 4.8924],
  ['Chambéry', 45.5646, 5.9178], ['Pau', 43.2951, -0.3708], ['Bayonne', 43.4933, -1.4751],
  ['Saint-Denis', 48.9362, 2.3574], ['Boulogne-Billancourt', 48.8354, 2.2413],
  ['Versailles', 48.8014, 2.1301], ['Créteil', 48.7904, 2.4556], ['Nanterre', 48.8924, 2.2066],
  ['Cergy', 49.0356, 2.0603], ['Évry-Courcouronnes', 48.623, 2.429],
  ['Saint-Denis (La Réunion)', -20.8789, 55.4481], ['Fort-de-France', 14.6037, -61.0742],
  ['Pointe-à-Pitre', 16.2411, -61.5331], ['Cayenne', 4.9224, -52.3135], ['Mamoudzou', -12.7806, 45.2278],
];

export const FRENCH_CITIES: readonly CityLocation[] = CITY_DATA.map(
  ([name, latitude, longitude]) => ({ name, latitude, longitude })
);

function comparable(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('fr-FR');
}

/** Returns a trusted location from the local catalogue, ready for future radius filtering. */
export function findFrenchCity(name: string | null | undefined): CityLocation | undefined {
  if (!name) return undefined;
  const cityName = comparable(name);
  return FRENCH_CITIES.find((city) => comparable(city.name) === cityName);
}
