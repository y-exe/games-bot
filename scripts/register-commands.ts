import {REST} from 'discord.js';
import {requireToken,settings} from '../src/config.js';
import {syncStartupCommands} from '../src/services/command-sync.js';

await syncStartupCommands(new REST({version:'10'}).setToken(requireToken()),settings);
