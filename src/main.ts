import helloBuffersSample from './03_buffers_etc';
import helloComputeSample from './02_hello_compute';
import helloTexturesSample from "./04_textures";

import './style.css';

document.querySelector('#app')?.append(
	helloComputeSample,
	helloBuffersSample,
	helloTexturesSample,
);
