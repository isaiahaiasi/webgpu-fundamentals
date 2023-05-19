struct VOut {
	@builtin(position) position: vec4f,
	@location(0) fragUV: vec2f,
};

@group(0) @binding(0) var texSampler : sampler;
@group(0) @binding(1) var bgTex : texture_2d<f32>;
@group(0) @binding(2) var agentTex : texture_2d<f32>;

// simple texture rendering based on:
// https://webgpu.github.io/webgpu-samples/samples/imageBlur
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VOut {
	// This is a little sketchy, but if everything is being done in shaders,
	// there's no need to complicate the pipeline with vector buffers etc.
	const pos = array(
	vec2( 1.0,  1.0),
	vec2( 1.0, -1.0),
	vec2(-1.0, -1.0),
	vec2( 1.0,  1.0),
	vec2(-1.0, -1.0),
	vec2(-1.0,  1.0),
  );

  const uv = array(
	vec2(1.0, 0.0),
	vec2(1.0, 1.0),
	vec2(0.0, 1.0),
	vec2(1.0, 0.0),
	vec2(0.0, 1.0),
	vec2(0.0, 0.0),
  );

	var output: VOut;
	output.position = vec4(pos[vi], 0.0, 1.0);
	output.fragUV = uv[vi];

	return output;
}

@fragment
fn fs(@location(0) fragUV: vec2f) -> @location(0) vec4f {
	return textureSample(agentTex, texSampler, fragUV)
	  // + vec4f(0, 0, 0, 1);
		+ textureSample(bgTex, texSampler, fragUV);
}
