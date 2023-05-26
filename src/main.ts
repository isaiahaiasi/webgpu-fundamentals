import helloTriangle from "./01_hello_triangle";
import helloBuffersSample from "./03_buffers_etc";
import helloComputeSample from "./02_hello_compute";
import helloTexturesSample from "./04_textures";
import slimeMoldSample from "./06_slime_molds";

import './style.css';

document.querySelector('#app')?.append(
	slimeMoldSample,
	helloTriangle,
	helloComputeSample,
	helloBuffersSample,
	helloTexturesSample,
);
