// Server-side helpers for captain logins: every team gets a username and a generated passphrase.
// Behind the scenes a login is a Firebase Email/Password account with a made-up address, so nobody has to give an email.
import { randomInt } from 'node:crypto';

export { LOGIN_DOMAIN, captainUid, loginEmail, isCaptainEmail, usernameFrom } from './captainAccount.js';
// 256 short, easy-to-type words. Three words plus three digits is about 34 bits, on top of Firebase's sign-in rate limits.
export const WORDS = ('able acorn aegis agate alder amber anchor angle apple arbor arrow aster atlas aurora badge baker banjo basil beach beam berry birch bison blaze bloom bluff bonus boost brave bread brick bridge brook brush cabin cable cairn camel candy canoe cargo cedar chalk charm chess chief cider cliff cloud clover cobra comet coral cosmic crane creek crest crown daisy dance delta denim desert diver dolphin dragon dune eagle ember emerald engine falcon fable fern ferry field finch flame flint flora forest fossil frost galaxy garden garnet ginger glacier globe gold grape grove guitar harbor hazel heron honey horizon hunter indigo iris island ivory jade jaguar jasper jazz jewel jolly journey jungle kayak kernel kettle kiwi koala lagoon lantern laser lemon lilac linen lion lotus lucky lunar magnet mango maple marble meadow melon mercury meteor mint mirror mocha moose mosaic nectar neon nickel noble nomad north oasis ocean olive onyx opal orbit orchid otter oxford paddle panda pearl pebble pepper phoenix pilot pine planet plum polar poppy prairie prism puma quartz quest quill rabbit raven reef ridge river robin rocket rose ruby saddle sage sail salmon sand scarlet shadow shore silver sky slate solar spark spice spruce star stone storm summit sunny swift tango teal tennis thunder tiger timber topaz torch tower trail tulip tundra turbo twist umber valley velvet violet vortex walnut wave willow winter wizard wolf yacht yellow zebra zephyr zinc zesty acre bamboo barley breeze cactus canyon cherry dawn dusk elm fjord gale haven kite lava lynx mesa moss pixel rally sprint volley court').split(' ');

const NAME_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alike characters
const slug = name => String(name ?? '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'captain';

export function newUsername(firstName, rand = randomInt) {
  return `${slug(firstName)}-${Array.from({ length: 4 }, () => NAME_ALPHABET[rand(NAME_ALPHABET.length)]).join('')}`;
}
export function newPassword(rand = randomInt) {
  const words = Array.from({ length: 3 }, () => WORDS[rand(WORDS.length)]);
  return `${words.join('-')}-${String(rand(1000)).padStart(3, '0')}`;
}
export const newLogin = (firstName, rand = randomInt) => ({ username: newUsername(firstName, rand), password: newPassword(rand) });
