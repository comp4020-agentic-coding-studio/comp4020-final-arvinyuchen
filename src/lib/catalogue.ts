// The places Spots starts with, so a new group has something to explore
// before anyone has added their own. Deliberately short and deliberately
// Canberra: landmarks and well-known areas any group here could go to, not a
// directory of the whole city. A group's own finds go alongside these (see
// addCustomSpot in db.ts), and those are the ones that make a list theirs.
export type Kind = "food" | "fun" | "outdoors";

export interface CatalogueSpot {
  key: string;
  name: string;
  kind: Kind;
  area: string;
  blurb: string;
}

export const KIND_LABEL: Record<Kind, string> = {
  food: "Food",
  fun: "Fun",
  outdoors: "Outdoors",
};

export const CATALOGUE: CatalogueSpot[] = [
  { key: "lonsdale-st", name: "Lonsdale Street", kind: "food", area: "Braddon", blurb: "A strip of cafés, bars and late food, the default for a night out near ANU." },
  { key: "woolley-st", name: "Woolley Street", kind: "food", area: "Dickson", blurb: "Dickson's run of Asian restaurants: dumplings, noodles, hot pot." },
  { key: "bus-depot-markets", name: "Old Bus Depot Markets", kind: "food", area: "Kingston", blurb: "Sunday market in an old bus depot: food stalls, makers, a slow morning." },
  { key: "haig-park-markets", name: "Haig Park Village Markets", kind: "food", area: "Braddon", blurb: "Sunday food market under the trees in Haig Park." },
  { key: "questacon", name: "Questacon", kind: "fun", area: "Parkes", blurb: "The science centre: hands-on exhibits that are more fun with friends than you'd admit." },
  { key: "nga", name: "National Gallery of Australia", kind: "fun", area: "Parkes", blurb: "The national collection, plus the sculpture garden out the back." },
  { key: "nma", name: "National Museum of Australia", kind: "fun", area: "Acton", blurb: "On the peninsula right next to ANU, an easy afternoon." },
  { key: "awm", name: "Australian War Memorial", kind: "fun", area: "Campbell", blurb: "The memorial and its galleries, at the far end of Anzac Parade." },
  { key: "glassworks", name: "Canberra Glassworks", kind: "fun", area: "Kingston", blurb: "Watch glassblowers work in the old Kingston power house." },
  { key: "mt-ainslie", name: "Mount Ainslie Lookout", kind: "outdoors", area: "Campbell", blurb: "Walk up from behind the War Memorial for the view over the lake and Parliament." },
  { key: "lake-loop", name: "Lake Burley Griffin loop", kind: "outdoors", area: "Central", blurb: "Walk or ride around the lake: the short bridge-to-bridge loop is about 5 km." },
  { key: "arboretum", name: "National Arboretum", kind: "outdoors", area: "Molonglo", blurb: "Forests from around the world, big skies and a picnic lawn." },
  { key: "botanic-gardens", name: "Australian National Botanic Gardens", kind: "outdoors", area: "Acton", blurb: "Native gardens on Black Mountain's slope, a walk from campus." },
  { key: "tidbinbilla", name: "Tidbinbilla Nature Reserve", kind: "outdoors", area: "Paddys River", blurb: "A day trip: kangaroos, wetlands and bush walks, about 40 minutes out." },
];
