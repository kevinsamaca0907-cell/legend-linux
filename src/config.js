// Valores sacados de resource/config/{legend,common}.cfg y GameConfig.cs del launcher oficial.
const playHost = 'https://gamebox3.creaction-network.com';
const webVersion = '2.4.1';
const clientVersion = '3.4.7.0';
// Idioma del servidor: de, es, pt, tr, ar, sv, el, nl, pl (los que lista common.cfg).
const language = 'es';
const gameId = language === 'pt' ? 'lobr' : 'lo' + language; // como GameConfig.readConfig
const gameName = 'Legend Online';
const gameDomain = 'creaction-network.com';
const channel = 'oas';

const template = `${playHost}/gamebox/${webVersion}/template`;

function loginUrl() {
  return `${template}/login.php?lg=${language}&gameid=${gameId}&maintype=play&page=login&account=oas` +
    `&version=${clientVersion}&channel=${channel}&playertype=logingame`;
}

function playUrl(token, username) {
  return `${template}/game.php?channel=oas&token=${encodeURIComponent(token)}&lg=${language}` +
    `&gameid=${gameId}&name=${encodeURIComponent(username)}&version=${clientVersion}` +
    `&gamename=${encodeURIComponent(gameName)}`;
}

// Respuesta fija de GameBirdge.WINIE_Localstorage.
function localStorageData() {
  const host = playHost.replace('https://', '');
  const games = `//${host}/gamebox/${webVersion}/static/games/${gameId}`;
  return {
    name: gameName,
    ico: `${games}/icon.jpg`,
    serverbgpic: `${games}/list.jpg`,
    accountbgpic: `${games}/smallload.jpg`,
    url: `//odp3.oasgames.com/api/game/serverlist?gamecode=${gameId}&uid={uid}`,
    openGamesFlag: 1,
    login_css: `//${host}/gamebox/${webVersion}/static/css/oas.${gameId}.css`,
    login_skin: '2',
    getNewsUrl: `//odp3.oasgames.com/api/game/gbox-news?gamecode=${gameId}`,
  };
}

// Navegación de primer nivel permitida; lo demás se abre en el navegador del sistema.
const allowedDomains = ['creaction-network.com', 'oasgames.com'];

module.exports = {
  playHost, gameDomain, loginUrl, playUrl, localStorageData, allowedDomains,
  flashVersion: '32.0.0.453',
};
