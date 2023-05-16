import helloBuffersSample from './03_buffers_etc';
import helloComputeSample from './02_hello_compute';
import helloTexturesSample from "./04_textures";
import gameOfLifeSample from "./05_game_of_life";

import './style.css';

document.querySelector('#app')?.append(
	helloComputeSample,
	helloBuffersSample,
	helloTexturesSample,
	gameOfLifeSample,
);
