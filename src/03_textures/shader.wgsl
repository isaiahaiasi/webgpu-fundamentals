struct VertOutput {
	@builtin(position) position: vec4f,
	@location(0) texcoord: vec2f,
};

struct Uniforms {
	scale: vec2f,
	offset: vec2f,
};

@group(0) @binding(2) var<uniform> uni: Uniforms;

@vertex fn vs(
	@builtin(vertex_index) vertexIndex : u32
) -> VertOutput {
	var pos = array<vec2f, 6>(
		// 1st tri
		vec2f( 0.0, 0.0), // center
		vec2f( 1.0, 0.0), // right, center
		vec2f( 0.0, 1.0), // center, top
		// 2nd tri
		vec2f( 0.0, 1.0), // center, top
		vec2f( 1.0, 0.0), // right, center
		vec2f( 1.0, 1.0), // right, top
	);

	var vsOutput: VertOutput;
	let xy = pos[vertexIndex];
	vsOutput.position = vec4f(xy * uni.scale + uni.offset, 0.0, 1.0);
	vsOutput.texcoord = xy;
	return vsOutput;
}

@group(0) @binding(0) var ourSampler: sampler;
@group(0) @binding(1) var ourTexture: texture_2d<f32>;

@fragment fn fs(fsInput: VertOutput) -> @location(0) vec4f {
	return textureSample(ourTexture, ourSampler, fsInput.texcoord);
}