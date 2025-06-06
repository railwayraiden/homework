-- Create tables for a music albums database
CREATE TABLE IF NOT EXISTS artists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  country VARCHAR(100),
  formed_year INTEGER
);

CREATE TABLE IF NOT EXISTS albums (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  release_date DATE,
  genre VARCHAR(100),
  artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tracks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  duration INTEGER, -- duration in seconds
  track_number INTEGER,
  album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE
);
-- Seed the database with sample data
INSERT INTO artists (name, country, formed_year) VALUES
  ('Pink Floyd', 'United Kingdom', 1965),
  ('Radiohead', 'United Kingdom', 1985),
  ('Pusha T', 'United States', 2002),
  ('Daft Punk', 'France', 1993);

INSERT INTO albums (title, release_date, genre, artist_id) VALUES
  ('The Dark Side of the Moon', '1973-03-01', 'Progressive Rock', 1),
  ('OK Computer', '1997-05-21', 'Alternative Rock', 2),
  ('Daytona', '2018-05-25', 'Hip Hop', 3),
  ('Random Access Memories', '2013-05-17', 'Electronic', 4);

INSERT INTO tracks (title, duration, track_number, album_id) VALUES
  ('Speak to Me', 90, 1, 1),
  ('Breathe', 163, 2, 1),
  ('Time', 421, 4, 1),
  ('Paranoid Android', 387, 2, 2),
  ('Karma Police', 264, 5, 2),
  ('If You Know You Know', 185, 1, 3),
  ('The Games We Play', 201, 2, 3),
  ('Get Lucky', 369, 8, 4),
  ('Instant Crush', 337, 5, 4);
