// Example boards shipped with the application (original content).
import type { BoardContent } from './game.js';

type Row = [string, string];
function cat(id: string, name: string, rows: Row[], base = 200, dw: number[] = []) {
  return {
    id,
    name,
    clues: rows.map(([question, answer], i) => ({
      id: `${id}_${i + 1}`,
      value: base * (i + 1),
      question,
      answer,
      ...(dw.includes(i) ? { dailyWager: true } : {}),
    })),
  };
}

export const SAMPLE_BOARD_TITLE = 'Starter Trivia Night';

export const SAMPLE_BOARD: BoardContent = {
  rounds: [
    {
      id: 'r1',
      name: 'Round 1',
      kind: 'standard',
      categories: [
        cat('hist', 'History', [
          ['This ancient civilization built Machu Picchu.', 'The Inca'],
          ['The Magna Carta was sealed in this century.', 'The 13th century (1215)'],
          ['This wall divided a German city from 1961 to 1989.', 'The Berlin Wall'],
          ['This empire was ruled from Constantinople for over 1,000 years.', 'The Byzantine Empire'],
          ['This 1648 set of treaties ended the Thirty Years\' War.', 'The Peace of Westphalia'],
        ]),
        cat('sci', 'Science', [
          ['H2O is the chemical formula for this.', 'Water'],
          ['This planet is known as the Red Planet.', 'Mars'],
          ['The powerhouse of the cell.', 'The mitochondrion'],
          ['This force keeps planets in orbit around the Sun.', 'Gravity'],
          ['This element has atomic number 79.', 'Gold'],
        ], 200, [3]),
        cat('geo', 'Geography', [
          ['The largest ocean on Earth.', 'The Pacific Ocean'],
          ['This country has the city of Kyoto.', 'Japan'],
          ['The longest river in South America.', 'The Amazon'],
          ['This is the capital city of Canada.', 'Ottawa'],
          ['The smallest country in the world by area.', 'Vatican City'],
        ]),
        cat('food', 'Food & Drink', [
          ['Guacamole is mostly made from this fruit.', 'Avocado'],
          ['This Italian cheese is traditional on a Margherita pizza.', 'Mozzarella'],
          ['Sushi rice is seasoned with this type of vinegar.', 'Rice vinegar'],
          ['This spice gives curry its yellow color.', 'Turmeric'],
          ['Champagne must come from this country.', 'France'],
        ]),
        cat('words', 'Wordplay', [
          ['A word that reads the same forwards and backwards.', 'A palindrome'],
          ['"Listen" is an anagram of this word meaning quiet.', 'Silent'],
          ['The opposite of an antonym.', 'A synonym'],
          ['This punctuation mark is also called a full stop.', 'A period'],
          ['A word formed from the first letters of other words, like NASA.', 'An acronym'],
        ]),
        cat('tech', 'Technology', [
          ['This company makes the iPhone.', 'Apple'],
          ['The "www" in a web address stands for this.', 'World Wide Web'],
          ['A group of 8 bits.', 'A byte'],
          ['This programming language shares its name with a coffee island.', 'Java'],
          ['This 1969 network was a forerunner of the internet.', 'ARPANET'],
        ]),
      ],
    },
    {
      id: 'r2',
      name: 'Round 2',
      kind: 'standard',
      categories: [
        cat('space', 'Space', [
          ['The closest star to Earth.', 'The Sun'],
          ['The first person to walk on the Moon.', 'Neil Armstrong'],
          ['This planet has the most famous rings.', 'Saturn'],
          ['Our galaxy is called this.', 'The Milky Way'],
          ['This telescope launched in 2021 observes in infrared.', 'The James Webb Space Telescope'],
        ], 400),
        cat('music', 'Music', [
          ['This instrument has 88 keys.', 'The piano'],
          ['A group of four musicians.', 'A quartet'],
          ['This composer wrote the "Moonlight Sonata".', 'Beethoven'],
          ['The number of lines on a musical staff.', 'Five'],
          ['The Italian term for gradually getting louder.', 'Crescendo'],
        ], 400, [2]),
        cat('animals', 'Animals', [
          ['The largest mammal on Earth.', 'The blue whale'],
          ['A baby kangaroo is called this.', 'A joey'],
          ['This bird is a symbol of peace.', 'The dove'],
          ['This is the only mammal capable of true flight.', 'The bat'],
          ['A group of crows is called this.', 'A murder'],
        ], 400),
        cat('sports', 'Sports', [
          ['The number of players per side on a soccer field.', 'Eleven'],
          ['This sport uses a shuttlecock.', 'Badminton'],
          ['The Tour de France is a race in this sport.', 'Cycling'],
          ['A perfect score in ten-pin bowling.', '300'],
          ['This city hosted the first modern Olympics in 1896.', 'Athens'],
        ], 400),
        cat('math', 'Math', [
          ['The number of sides on a hexagon.', 'Six'],
          ['The value of pi to two decimal places.', '3.14'],
          ['The square root of 144.', '12'],
          ['A triangle with all sides equal.', 'An equilateral triangle'],
          ['The only even prime number.', 'Two'],
        ], 400),
        cat('movies', 'At the Movies', [
          ['Animated films often begin with storyboards drawn in this order.', 'Sequence / scene order'],
          ['The award statuette given by the Academy of Motion Picture Arts and Sciences.', 'The Oscar'],
          ['The job title of the person who directs a film.', 'Director'],
          ['Frames per second used by traditional cinema.', '24'],
          ['The term for the text that rolls at the end of a movie.', 'The credits'],
        ], 400),
      ],
    },
    {
      id: 'rf',
      name: 'Final Wager',
      kind: 'final',
      categories: [
        {
          id: 'final',
          name: 'World Capitals',
          clues: [{ id: 'final_1', value: 0, question: 'This capital city sits on both banks of the Danube and was formed by uniting three towns in 1873.', answer: 'Budapest' }],
        },
      ],
    },
  ],
};
