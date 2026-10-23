import {parentPort,workerData} from 'node:worker_threads';
import {chooseChessMove} from './chess-ai.js';

if(parentPort)parentPort.postMessage(chooseChessMove(workerData.fen));
