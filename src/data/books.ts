/**
 * The reading shelf on /blog/recent-reads/, in the same order as the original page.
 * Add a book by adding a line; `reflection` links a cover to the entry written about it.
 */
export interface Book {
  cover: string;
  title: string;
  author: string;
  reflection?: string;
}

const shelf = (file: string) => `/assets/Books%20I%20Have%20Read/${file}`;

export const books: Book[] = [
  { cover: shelf("1.jpg"), title: "God and the Afterlife", author: "Jeffrey Long", reflection: "/blog/post/reflections-on-god-and-the-afterlife/" },
  { cover: shelf("2.jpg"), title: "A Promised Land", author: "Barack Obama" },
  { cover: shelf("3.jpg"), title: "The Autobiography of Benjamin Franklin", author: "Benjamin Franklin" },
  { cover: shelf("4.jpg"), title: "Unfu*k Yourself", author: "Gary John Bishop" },
  { cover: shelf("5.jpg"), title: "Chaos", author: "Tom O’Neill" },
  { cover: shelf("6.jpg"), title: "Man’s Search for Meaning", author: "Viktor E. Frankl" },
  { cover: shelf("7.jpg"), title: "Journeys Out of the Body", author: "Robert A. Monroe" },
  { cover: shelf("8.jpg"), title: "Killing the Witches", author: "Bill O’Reilly" },
  // The original page linked this cover to a reflection in /blog/private/, which is not published.
  { cover: shelf("9.jpg"), title: "The Immortality Key", author: "Brian C. Muraresku" },
  { cover: shelf("10.jpg"), title: "Night", author: "Elie Wiesel" },
  { cover: shelf("11.jpg"), title: "Greenlights", author: "Matthew McConaughey" },
  { cover: shelf("12.jpg"), title: "Washington: A Life", author: "Ron Chernow" },
  { cover: shelf("13.jpg"), title: "Far Journeys", author: "Robert A. Monroe" },
  { cover: shelf("14.jpg"), title: "The Heavenly Man", author: "Brother Yun with Paul Hattaway" },
  { cover: shelf("15.jpg"), title: "Endure", author: "Cameron Hanes" },
  { cover: shelf("16.jpg"), title: "Can’t Hurt Me", author: "David Goggins" },
  { cover: shelf("17.jpg"), title: "Ultimate Journey", author: "Robert A. Monroe" },
  { cover: shelf("18.jpg"), title: "Undeniable", author: "Cameron Hanes" },
  { cover: shelf("19.jpg"), title: "My Inventions", author: "Nikola Tesla" },
  { cover: shelf("20.jpg"), title: "From Here to the Great Unknown", author: "Lisa Marie Presley and Riley Keough" },
  { cover: shelf("21.png"), title: "Food of the Gods", author: "Terence McKenna" },
  { cover: shelf("22.jpeg"), title: "Poems & Prayers", author: "Matthew McConaughey" },
  { cover: shelf("23.jpg"), title: "Why We Sleep", author: "Matthew Walker" },
  { cover: shelf("24.jpeg"), title: "Zealot", author: "Reza Aslan", reflection: "/blog/post/reflections-on-zealot-by-reza-aslan/" },
  { cover: shelf("25.jpeg"), title: "The Origin of Satan", author: "Elaine Pagels" },
  { cover: shelf("26.jpeg"), title: "Blitzed", author: "Norman Ohler" },
  { cover: shelf("ReadYourMind.jpeg"), title: "Read Your Mind", author: "Oz Pearlman" },
  { cover: shelf("28.webp"), title: "American Kingpin", author: "Nick Bilton" },
  { cover: "/blog/images/theWarofArt.jpg", title: "The War of Art", author: "Steven Pressfield" },
  { cover: shelf("theruthlesseliminationofhurry.jpeg"), title: "The Ruthless Elimination of Hurry", author: "John Mark Comer" },
  { cover: shelf("dopaminenation.jpg"), title: "Dopamine Nation", author: "Anna Lembke" },
  { cover: shelf("theroadlesstraveled.jpg"), title: "The Road Less Traveled", author: "M. Scott Peck" },
];
