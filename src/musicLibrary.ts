import { orderedMusicUrls } from './musicPlaylist';

const songs = import.meta.glob('./assets/music/*.{mp3,ogg,m4a,wav,webm}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const musicPlaylist = orderedMusicUrls(songs);
