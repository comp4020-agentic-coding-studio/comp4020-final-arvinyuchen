// The places Spots starts with, so a new group has something to explore
// before anyone has added their own. Deliberately short and deliberately
// Canberra. Every entry was checked against its Wikipedia article (`source`)
// for its name, its suburb and the claims in its blurb; a claim the article
// didn't back up was cut. A group's own finds go alongside these (see
// addCustomPick in db.ts), and those are the ones that make a list theirs.
//
// Coordinates come from each Wikipedia article, or, where it has none (the
// two streets, the markets, Questacon), from OpenStreetMap's Nominatim.
//
// These are only the seed: on boot they're upserted into the shared `places`
// table (src/lib/db.ts), where every place any group adds joins them.
//
// Photos are from Wikimedia Commons under the licence named, hotlinked as
// 800px thumbnails, and credited on the card with a link to the file page,
// which is what CC BY and CC BY-SA ask for.
export type Kind = "food" | "fun" | "outdoors";

export interface Photo {
  src: string;
  page: string;
  credit: string;
  license: string;
}

export interface CatalogueSpot {
  key: string;
  lat: number;
  lon: number;
  name: string;
  kind: Kind;
  area: string;
  blurb: string;
  source: string;
  photo: Photo;
}

export const KIND_LABEL: Record<Kind, string> = {
  food: "Food",
  fun: "Fun",
  outdoors: "Outdoors",
};

export const CATALOGUE: CatalogueSpot[] = [
  {
    key: "lonsdale-st",
    lat: -35.2759125,
    lon: 149.1324111,
    name: "Lonsdale Street",
    kind: "food",
    area: "Braddon",
    blurb: "A strip of cafés, bars and late food, the default for a night out near ANU.",
    source: "https://en.wikipedia.org/wiki/Braddon,_Australian_Capital_Territory",
    photo: { src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e8/Lonsdale_Street_Braddon_September_2017.jpg/960px-Lonsdale_Street_Braddon_September_2017.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page: "https://commons.wikimedia.org/wiki/File:Lonsdale_Street_Braddon_September_2017.jpg", credit: "Nick-D", license: "CC BY-SA 3.0" },
  },
  {
    key: "woolley-st",
    lat: -35.2502783,
    lon: 149.1366687,
    name: "Woolley Street",
    kind: "food",
    area: "Dickson",
    blurb: "Dickson's run of Asian restaurants: dumplings, noodles, hot pot.",
    source: "https://en.wikipedia.org/wiki/Dickson,_Australian_Capital_Territory",
    photo: { src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5b/Woolley_St%2C_Dickson.JPG/960px-Woolley_St%2C_Dickson.JPG?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page: "https://commons.wikimedia.org/wiki/File:Woolley_St,_Dickson.JPG", credit: "Grahamec", license: "CC BY-SA 3.0" },
  },
  {
    key: "bus-depot-markets",
    lat: -35.312704,
    lon: 149.144205,
    name: "Old Bus Depot Markets",
    kind: "food",
    area: "Kingston",
    blurb: "Every Sunday by the lake: food stalls and handmade goods in the old bus depot.",
    source: "https://en.wikipedia.org/wiki/Kingston,_Australian_Capital_Territory",
    photo: { src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/48/Old_Bus_Depot_Market_September_2024.jpg/960px-Old_Bus_Depot_Market_September_2024.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page: "https://commons.wikimedia.org/wiki/File:Old_Bus_Depot_Market_September_2024.jpg", credit: "Nick-D", license: "CC BY-SA 4.0" },
  },
  {
    key: "questacon",
    lat: -35.2985062,
    lon: 149.1312548,
    name: "Questacon",
    kind: "fun",
    area: "Parkes",
    blurb: "The science centre: hands-on exhibits that are more fun with friends than you'd admit.",
    source: "https://en.wikipedia.org/wiki/Questacon",
    photo: { src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/36/Questacon_-_National_Science_and_Technology_Centre.jpg/960px-Questacon_-_National_Science_and_Technology_Centre.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page: "https://commons.wikimedia.org/wiki/File:Questacon_-_National_Science_and_Technology_Centre.jpg", credit: "Shkuru Afshar", license: "CC BY-SA 4.0" },
  },
  {
    key: "nga",
    lat: -35.3003,
    lon: 149.1364,
    name: "National Gallery of Australia",
    kind: "fun",
    area: "Parkes",
    blurb: "The national art collection, plus the sculpture garden outside.",
    source: "https://en.wikipedia.org/wiki/National_Gallery_of_Australia",
    photo: { src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9a/National_Gallery_from_SW%2C_Canberra_Australia.jpg/960px-National_Gallery_from_SW%2C_Canberra_Australia.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page: "https://commons.wikimedia.org/wiki/File:National_Gallery_from_SW,_Canberra_Australia.jpg", credit: "Thennicke", license: "CC BY-SA 4.0" },
  },
  {
    key: "nma",
    lat: -35.293056,
    lon: 149.120833,
    name: "National Museum of Australia",
    kind: "fun",
    area: "Acton",
    blurb: "On Acton Peninsula right next to ANU, an easy afternoon.",
    source: "https://en.wikipedia.org/wiki/National_Museum_of_Australia",
    photo: { src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0d/Canberra_%28AU%29%2C_National_Museum_of_Australia_--_2019_--_1709.jpg/960px-Canberra_%28AU%29%2C_National_Museum_of_Australia_--_2019_--_1709.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page: "https://commons.wikimedia.org/wiki/File:Canberra_(AU),_National_Museum_of_Australia_--_2019_--_1709.jpg", credit: "Dietmar Rabich", license: "CC BY-SA 4.0" },
  },
  {
    key: "awm",
    lat: -35.2805,
    lon: 149.1491,
    name: "Australian War Memorial",
    kind: "fun",
    area: "Campbell",
    blurb: "The memorial and its galleries, at the end of Anzac Parade.",
    source: "https://en.wikipedia.org/wiki/Australian_War_Memorial",
    photo: { src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9c/Australian_War_Memorial_front_view.jpg/960px-Australian_War_Memorial_front_view.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page: "https://commons.wikimedia.org/wiki/File:Australian_War_Memorial_front_view.jpg", credit: "Shkuru Afshar", license: "CC BY-SA 4.0" },
  },
  {
    key: "glassworks",
    lat: -35.3115975,
    lon: 149.1436952,
    name: "Canberra Glassworks",
    kind: "fun",
    area: "Kingston",
    blurb: "Glass art studios and a gallery in the old Kingston Powerhouse.",
    source: "https://en.wikipedia.org/wiki/Canberra_Glassworks",
    photo: { src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/75/Entrance_to_Canberra_Glassworks_August_2022.jpg/960px-Entrance_to_Canberra_Glassworks_August_2022.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page: "https://commons.wikimedia.org/wiki/File:Entrance_to_Canberra_Glassworks_August_2022.jpg", credit: "Nick-D", license: "CC BY-SA 4.0" },
  },
  {
    key: "mt-ainslie",
    lat: -35.27,
    lon: 149.15833333,
    name: "Mount Ainslie",
    kind: "outdoors",
    area: "Campbell",
    blurb: "Take the paved Kokoda summit trail from behind the War Memorial for the view over the city.",
    source: "https://en.wikipedia.org/wiki/Mount_Ainslie",
    photo: { src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/ff/Mount_Ainslie.jpg/960px-Mount_Ainslie.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page: "https://commons.wikimedia.org/wiki/File:Mount_Ainslie.jpg", credit: "Bidgee", license: "CC BY 3.0" },
  },
  {
    key: "lake-loop",
    lat: -35.29333333,
    lon: 149.11388889,
    name: "Lake Burley Griffin",
    kind: "outdoors",
    area: "Central",
    blurb: "Walk or ride the paths around the lake in the middle of the city.",
    source: "https://en.wikipedia.org/wiki/Lake_Burley_Griffin",
    photo: { src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/23/Lake_Burley_Griffin_From_Black_Mountain_Tower_%28cropped%29.jpg/960px-Lake_Burley_Griffin_From_Black_Mountain_Tower_%28cropped%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page: "https://commons.wikimedia.org/wiki/File:Lake_Burley_Griffin_From_Black_Mountain_Tower_(cropped).jpg", credit: "JJ Harrison", license: "CC BY-SA 3.0" },
  },
  {
    key: "arboretum",
    lat: -35.29,
    lon: 149.07,
    name: "National Arboretum",
    kind: "outdoors",
    area: "Molonglo",
    blurb: "Forests from around the world, big skies and room for a picnic.",
    source: "https://en.wikipedia.org/wiki/National_Arboretum_Canberra",
    photo: { src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/Canberra_National_Arboretum_with_Telstra_Tower_2%2C_Canberra_ACT.jpg/960px-Canberra_National_Arboretum_with_Telstra_Tower_2%2C_Canberra_ACT.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page: "https://commons.wikimedia.org/wiki/File:Canberra_National_Arboretum_with_Telstra_Tower_2,_Canberra_ACT.jpg", credit: "Thennicke", license: "CC BY-SA 4.0" },
  },
  {
    key: "botanic-gardens",
    lat: -35.27888889,
    lon: 149.10916667,
    name: "Australian National Botanic Gardens",
    kind: "outdoors",
    area: "Acton",
    blurb: "Native plant gardens on Black Mountain, a walk from campus.",
    source: "https://en.wikipedia.org/wiki/Australian_National_Botanic_Gardens",
    photo: { src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cb/Australian_National_Botanic_Gardens.jpg/960px-Australian_National_Botanic_Gardens.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page: "https://commons.wikimedia.org/wiki/File:Australian_National_Botanic_Gardens.jpg", credit: "Bidgee", license: "CC BY-SA 3.0" },
  },
  {
    key: "haig-park",
    lat: -35.269729,
    lon: 149.130471,
    name: "Haig Park",
    kind: "outdoors",
    area: "Braddon",
    blurb: "A long, tree-lined park through Braddon and Turner, a few minutes from Lonsdale Street.",
    source: "https://en.wikipedia.org/wiki/Haig_Park",
    photo: { src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/53/Centre_of_Haig_Park_November_2020.jpg/960px-Centre_of_Haig_Park_November_2020.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page: "https://commons.wikimedia.org/wiki/File:Centre_of_Haig_Park_November_2020.jpg", credit: "Nick-D", license: "CC BY-SA 4.0" },
  },
  {
    key: "tidbinbilla",
    lat: -35.46305556,
    lon: 148.91333333,
    name: "Tidbinbilla Nature Reserve",
    kind: "outdoors",
    area: "Paddys River",
    blurb: "A day trip out of the city: wildlife, wetlands and bush walks.",
    source: "https://en.wikipedia.org/wiki/Tidbinbilla_Nature_Reserve",
    photo: { src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/dc/Tidbinbilla_from_the_air.jpg/960px-Tidbinbilla_from_the_air.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail", page: "https://commons.wikimedia.org/wiki/File:Tidbinbilla_from_the_air.jpg", credit: "MDRX", license: "CC BY-SA 4.0" },
  },
];

