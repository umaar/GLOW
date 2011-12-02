var Complicated = (function() {

    // general variables 
    
    var context;
    var squareParticles = 128;
    var numParticles = squareParticles * squareParticles;

    // cameras, nodes and FBOs (will be created later)
 
    var cameraFBO              = new GLOW.Camera( { near: 0.1, far: 8000, aspect: 1 } );
    var camera                 = new GLOW.Camera( { near: 0.1, far: 8000 } );
    var cameraShadow           = new GLOW.Camera( { near: 0.1, far: 8000, ortho: { left: -3000, right: 3000, top: 3000, bottom: -3000 } } );
    var animalNode             = new GLOW.Node();
    var particleSimulationNode = new GLOW.Node();
    var particleRenderNode     = new GLOW.Node();
    var depthFBO;
    var particlesFBO;
    
    // animation variables
    
    var frames;
    var framesByAnimal;
    var animationSpeed     = 0.1;
    var animalMorph        = 0;
    var changeAnimal       = false;
    var animals            = [ "horse", "bearbrown", "mountainlion", "deer", "goldenretreiver", "fox", "seal", "chow", "bunny", "frog", "raccoon" ];
    var animalsScale       = [ 0.8,     0.8,         1.5,            1.5,    1.5,               3.0,   3.0,    3.0,    5.0,      5.0,   3.0       ];
    var currentAnimalIndex = 0;
    var currentAnimal      = animals[ 0 ];
    var nextAnimal         = animals[ 1 ];
    var mouseX             = 0;

    // Shaders and shader configuration objects
    // The undefines in the configs will be set
    // later, before creation of shader
    
    // The depth shader renders the animal into
    // the depth FBO. Note that we don't interleave
    // the aVertexAnimalXFrameY and aColorAnimalX
    // as we like to switch these to create an animation
    
    var depthShader;
    var depthShaderConfig = {
        vertexShader:       undefined,
        fragmentShader:     undefined,
        elements:           undefined,
        data: {
            uPerspectiveMatrix:     cameraFBO.projection,
            uViewMatrix:            animalNode.viewMatrix,
            aVertexAnimalAFrame0:   undefined,
            aVertexAnimalAFrame1:   undefined,
            aVertexAnimalBFrame0:   undefined,
            aVertexAnimalBFrame1:   undefined,
            aColorAnimalA:          undefined,
            aColorAnimalB:          undefined,
            uFrameMorphA:           new GLOW.Float(),
            uFrameMorphB:           new GLOW.Float(),
            uAnimalMorph:           new GLOW.Float(),
            uAnimalAScale:          new GLOW.Float(),
            uAnimalBScale:          new GLOW.Float()
        },
        interleave: {
            aVertexAnimalAFrame0:   false,
            aVertexAnimalAFrame1:   false,
            aVertexAnimalBFrame0:   false,
            aVertexAnimalBFrame1:   false,
            aColorAnimalA:          false,
            aColorAnimalB:          false,
        }
    };
    
    // The particle simulation shader updates each and
    // every particle's data by sampling and writing to 
    // the particle FBO (one pixel = one particle)
    
    var particleSimulationShader;
    var particleSimulationShaderConfig = {
        vertexShader:       undefined,
        fragmentShader:     undefined,
        points:             undefined, 
        data: {
            uPerspectiveMatrix:         cameraFBO.projection,
            uViewMatrix:                particleSimulationNode.viewMatrix,
            uDepthFBO:                  undefined,
            uParticlesFBO:              undefined,
            aSimulationDataPositions:   undefined,
            aParticlePositions:         undefined,
        }
    };
    
    // The particle render shader uses the data that the
    // particle simulation shader has written and renders
    // the actual 3D-particle to the screen
    
    var particleRenderShaders;
    var particleRenderShaderConfig = {
        vertexShader:       undefined,
        fragmentShader:     undefined,
        triangles:          undefined,
        data: {
            uPerspectiveMatrix:     camera.projection,
            uViewMatrix:            particleRenderNode.viewMatrix,
            uParticlesFBO:          undefined,
            aParticlePositions:     undefined,
            aParticleDirections:    undefined,
            aParticleNormals:       undefined,
            aParticleDarkness:      undefined
        }
    };
    
    // The shadow render shader draws the particles to the shadow
    // FBO, which then is displayed on a plane using the particle
    // shadow dislpay shader
    
    var shadowRenderShaders;
    var shadowRenderShaderConfig = {
        vertexShader:       undefined,
        fragmentShader:     undefined,
        triangles:          undefined,
        data: {
            uOrthoMatrix:           cameraShadow.projection,
            uViewMatrix:            particleRenderNode.viewMatrix,
            uParticlesFBO:          undefined,
            aParticlePositions:     undefined,
            aParticleDirections:    undefined,
        }
    } 
    
    // temp
    
    var depthToScreenShader;
    var depthToScreenShaderConfig = {
        vertexShader:   undefined,
        fragmentShader: undefined,
		elements:       GLOW.Geometry.Plane.elements(),
        data: {
            aVertices:  GLOW.Geometry.Plane.vertices(),
            aUVs:       GLOW.Geometry.Plane.uvs(),
            uFBO:       undefined
        }
    }
    
    // methods
    
    var load = function() {
        new GLOW.Load( {
            
            // the things we want to load...
            
            animal:                     "animals.js",
            depthShader:                "Depth.glsl",
            particleSimulationShader:   "ParticleSimulation.glsl",
            particleRenderShader:       "ParticleRender.glsl",
            depthToScreenShader:        "DepthToScreen.glsl",

            // ...and what we do when they are loaded.

            onLoadComplete: function( result ) {
                
                // setup context
                // we need to do this first as the frames creation
                // uses the global GL to create buffers
              
                context = new GLOW.Context();
                
                if( context.GL === null ) {
                    alert( "Couldn't initialize WebGL" );
                    return;
                }
                
                var a = new Array( 10 );
                var b = new Float32Array( 10 );
                
                context.setupClear( { red: 1, green: 1, blue: 1 } );
//                context.domElement.style.position = 'absolute';
//                context.domElement.style.left = '100px';
//                context.domElement.style.top = '100px';
                
                document.getElementById( "container" ).appendChild( context.domElement );

                // parse animal faces (Three.js format)
                // We're really just interested in faces so we're skipping the rest 
                // Colors are taken out in a separate loop
                // Code snatched from Three.js by @mrdoob and @alteredq
                  
                var f, t, fl, i, n;
                var animalTriangles = [];
                var threeJsFaces = result.animal.faces;
        		var type, isQuad, hasMaterial,
        		    hasFaceUv, hasFaceVertexUv,
        		    hasFaceNormal, hasFaceVertexNormal,
        		    hasFaceColor, hasFaceVertexColor;

                for( f = 0, t = 0, fl = threeJsFaces.length; f < fl; ) {
                    type                = threeJsFaces[ f++ ];
                    isQuad              = type & ( 1 << 0 );
                    hasMaterial         = type & ( 1 << 1 );
                    hasFaceUv           = type & ( 1 << 2 );
                    hasFaceVertexUv     = type & ( 1 << 3 );
                    hasFaceNormal       = type & ( 1 << 4 );
                    hasFaceVertexNormal = type & ( 1 << 5 );
                    hasFaceColor        = type & ( 1 << 6 );
                    hasFaceVertexColor  = type & ( 1 << 7 );

                    if( isQuad ) {
                        animalTriangles[ t++ ] = threeJsFaces[ f + 0 ];
                        animalTriangles[ t++ ] = threeJsFaces[ f + 1 ];
                        animalTriangles[ t++ ] = threeJsFaces[ f + 2 ];

                        animalTriangles[ t++ ] = threeJsFaces[ f + 0 ];
                        animalTriangles[ t++ ] = threeJsFaces[ f + 2 ];
                        animalTriangles[ t++ ] = threeJsFaces[ f + 3 ];

                        f += 4;
                    } else {
                        animalTriangles[ t++ ] = threeJsFaces[ f++ ];
                        animalTriangles[ t++ ] = threeJsFaces[ f++ ];
                        animalTriangles[ t++ ] = threeJsFaces[ f++ ];
                    }
                    
                    if( hasMaterial         ) f++;
                    if( hasFaceUv           ) f++;                  // lacks support for multiple UV layers 
                    if( hasFaceVertexUv     ) f += isQuad ? 4 : 3;  // lacks support for multiple UV layers
                    if( hasFaceNormal       ) f++;
                    if( hasFaceVertexNormal ) f += isQuad ? 4 : 3;
                    if( hasFaceColor        ) f++;
                    if( hasFaceVertexColor  ) f += isQuad ? 4 : 3;
                } 
                
                // Create colors
                // In the next loop we're putting these next to the animation
                // frame buffers for easy access in the update loop
                
                colorsByAnimal = {};
                
                var name, 
                    colors, 
                    threeJsMorphColors = result.animal.morphColors;
                
                for( f = 0, fl = threeJsMorphColors.length; f < fl; f++ ) {
                    name   = threeJsMorphColors[ f ].name.slice( 0, threeJsMorphColors[ f ].name.indexOf( "_" ));
                    colors = threeJsMorphColors[ f ].colors;
                     
                    colorsByAnimal[ name ] = GL.createBuffer();

                    GL.bindBuffer( GL.ARRAY_BUFFER, colorsByAnimal[ name ] );
                    GL.bufferData( GL.ARRAY_BUFFER, new Float32Array( colors ), GL.STATIC_DRAW );                
                }
                
                // create frames
                // we're just interested in having the WebGL buffers (GLOW.Attribute.buffer)
                // for each frame so we're creating them using the global GL
                
                frames = [];
                framesByAnimal = {};
                
                var threeJsMorphTargets = result.animal.morphTargets;
                for( f = 0, fl = threeJsMorphTargets.length; f < fl; f++ ) {
                    frames[ f ]              = {};
                    frames[ f ].name         =           threeJsMorphTargets[ f ].name.slice( 0, threeJsMorphTargets[ f ].name.indexOf( "_" )).toLowerCase();
                    frames[ f ].frame        = parseInt( threeJsMorphTargets[ f ].name.slice( threeJsMorphTargets[ f ].name.lastIndexOf( "_" ) + 1 ) - 1, 10 );
                    frames[ f ].colorBuffer  = colorsByAnimal[ frames[ f ].name ];
                    frames[ f ].vertexBuffer = GL.createBuffer();
                    
                    GL.bindBuffer( GL.ARRAY_BUFFER, frames[ f ].vertexBuffer );
                    GL.bufferData( GL.ARRAY_BUFFER, new Float32Array( threeJsMorphTargets[ f ].vertices ), GL.STATIC_DRAW );                
                }
                
                // create frames by animal
                
                for( f = 0, fl = frames.length; f < fl; f++ ) {
                    if( framesByAnimal[ frames[ f ].name ] === undefined )
                        framesByAnimal[ frames[ f ].name ] = [];
                    
                    framesByAnimal[ frames[ f ].name ][ frames[ f ].frame ] = { vertexBuffer: frames[ f ].vertexBuffer, colorBuffer: frames[ f ].colorBuffer };
                    framesByAnimal[ frames[ f ].name ].time   = 0;
                    framesByAnimal[ frames[ f ].name ].frame0 = 0;
                    framesByAnimal[ frames[ f ].name ].frame1 = 1;
                    framesByAnimal[ frames[ f ].name ].morph  = 0;
                }

                // Now to the fun part, setting up the shaders and FBOs...
                
                // First we create the depth shader, which renders the animal
                // into the deopth FBO
                // We set dummy vertex and color data as we're overwriting the buffer
                // later with the frames create above
                
                depthShaderConfig.vertexShader              = result.depthShader.vertexShader;
                depthShaderConfig.fragmentShader            = result.depthShader.fragmentShader;
                depthShaderConfig.triangles                 = new Uint16Array( animalTriangles );
                depthShaderConfig.data.aVertexAnimalAFrame0 = new Float32Array( 1 );
                depthShaderConfig.data.aVertexAnimalAFrame1 = new Float32Array( 1 );
                depthShaderConfig.data.aVertexAnimalBFrame0 = new Float32Array( 1 );
                depthShaderConfig.data.aVertexAnimalBFrame1 = new Float32Array( 1 );
                depthShaderConfig.data.aColorAnimalA        = new Float32Array( 1 );
                depthShaderConfig.data.aColorAnimalB        = new Float32Array( 1 );
                
                depthShader = new GLOW.Shader( depthShaderConfig );

                // now it's time to create particle simulation and render shader
                // first generate the particle data that we need for the simulation
                
                var particlePositions = [];
                var particleDirections = [];
                var particleDarkness = [];
                var particleTriangles = [];
                var particleUVs = [];
                var simulationPoints = [];
                var simulationPositions = [];
                var simulationDataXYUVs = [];
                var simulationData = [];
                var vec3 = new GLOW.Vector3();
                var x, y, z, u, v, s;
                for( var i = 0; i < numParticles; i++ ) {

                    // First simulation specific stuff...
                    // This is the elements array, containing
                    // offsets to the data created below (simulationDataXYUV)
                    
                    simulationPoints.push( i );
                    
                    // The simulation data XYUV is for sampling and writing
                    // For sampling the data, we need UV (0->1) and for 
                    // writing the data, we need XY (0->squareParticles). We 
                    // cram both XY and UV into a vec4. Note the weird 
                    // numbers in the formula for write position X - I can't
                    // really explain why it needs to be like this to work, 
                    // it might have to do with  128 * 1.001 = 128.128 ... 
                    // but I don't know, it's just weird :)

                    u = i % squareParticles;
                    v = Math.floor( i / squareParticles );
                    
                    simulationDataXYUVs.push( u * 1.001 / squareParticles * 2 - 0.999 );    // write position X (-1 -> 1)
                    simulationDataXYUVs.push( v * 1.001 / squareParticles * 2 - 0.999 );    // write position Y (-1 -> 1)
                    simulationDataXYUVs.push( u /= squareParticles );                       // read position U (0 -> 1)
                    simulationDataXYUVs.push( v /= squareParticles );                       // read position V (0 -> 1)

                    // This is the particle YZ. We calculate the X using the time
                    // stored in the FBO. As the amount of elements for the simulation
                    // and render missmatch we need to store them once for the simulation
                    // and once for the render (further down below) 

                    vec3.set( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 );
                    vec3.normalize();
                    vec3.multiplyScalar( Math.random() * 1500 );

                    x = vec3.value[ 0 ];//Math.random() * 1500 - 800;
                    y = vec3.value[ 1 ];//Math.random() * 2000 - 1000;
                    z = vec3.value[ 2 ];//Math.random() * 2000 - 1000;

                    x = Math.random() * 1500 - 800;
                    y = Math.random() * 2000 - 1000;
                    z = Math.random() * 2000 - 1000;
                    
                    simulationPositions.push( x );
                    simulationPositions.push( y );
                    simulationPositions.push( z );

                    // This is the data sent to the particleFBO at start

                    simulationData.push( Math.random());                            // x = translation time (0->1)
                    simulationData.push( Math.random() * 2 * 3.1415 );              // y = rotation
                    simulationData.push( 0.0 );                                     // z = size 
                    simulationData.push( 0.1 );                                     // w = luminence
                    
                    // And now the render specfic stuff...
                    // This is the elements array, containing
                    // offset to the data created below. We create
                    // three triangles per particle to get a nice
                    // 3D thingy instead of a simple 2D sprite/point

                    particleTriangles.push( i * 4 + 0 ); particleTriangles.push( i * 4 + 1 ); particleTriangles.push( i * 4 + 2 );
                    particleTriangles.push( i * 4 + 0 ); particleTriangles.push( i * 4 + 2 ); particleTriangles.push( i * 4 + 3 );
                    particleTriangles.push( i * 4 + 0 ); particleTriangles.push( i * 4 + 3 ); particleTriangles.push( i * 4 + 1 );
                    particleTriangles.push( i * 4 + 3 ); particleTriangles.push( i * 4 + 2 ); particleTriangles.push( i * 4 + 1 );
                    
                    // Save the positions for each particle (we created y and z above) 
                    
                    particlePositions.push( x ); particlePositions.push( y ); particlePositions.push( z ); 
                    particlePositions.push( x ); particlePositions.push( y ); particlePositions.push( z ); 
                    particlePositions.push( x ); particlePositions.push( y ); particlePositions.push( z ); 
                    particlePositions.push( x ); particlePositions.push( y ); particlePositions.push( z ); 
                    
                    // because the amount of elements in the renderer and the 
                    // simulation missmatch, we need to store the UVs again
                    // for the render (we created u and v above)
                    
                    particleUVs.push( u ); particleUVs.push( v );
                    particleUVs.push( u ); particleUVs.push( v );
                    particleUVs.push( u ); particleUVs.push( v );
                    particleUVs.push( u ); particleUVs.push( v );
                    
                    // This is the data to expand each position to create 
                    // a 3D-particle. We store this separately to be able
                    // to rotate and scale the particle in the shader
                    
                    particleDirections.push( 0.0 + Math.random() * 0.2 );
                    particleDirections.push( 0.7 + Math.random() * 0.2 );
                    particleDirections.push( 1.3 + Math.random() * 0.2 );
                    
                    particleDirections.push( -1.0 + Math.random() * 0.2 );
                    particleDirections.push(  0.7 + Math.random() * 0.2 );
                    particleDirections.push( -0.7 + Math.random() * 0.2 );
    				
    				particleDirections.push(  1.0 + Math.random() * 0.2 );
    				particleDirections.push(  0.7 + Math.random() * 0.2 );
    				particleDirections.push( -0.7 + Math.random() * 0.2 );
    				
    				particleDirections.push(  0.0 + Math.random() * 0.2 );
    				particleDirections.push( -1.3 + Math.random() * 0.2 );
    				particleDirections.push(  0.0 + Math.random() * 0.2 );
                }

                // Now let's enable floating point textures and setup 
                // the depth and particle FBOs. Note that we're using
                // type FLOAT and send in an Float32Array with the inital
                // simulation data. The depthFBO has to be twice as wide as high
                // as we're rendering the back to the left and the front to 
                // the right

                if( !context.enableExtension( "OES_texture_float" )) {
                    alert( "Your graphics card doesn't support floating point textures. Sorry!" );
                    return;
                }

                depthFBO = new GLOW.FBO( { width: 256, 
                                           height: 128, 
                                           type: GL.FLOAT,
                                           magFilter: GL.NEAREST, 
                                           minFilter: GL.NEAREST,
                                           clear: { alpha: 0 } } ); 

                particlesFBO = new GLOW.FBO( { width: squareParticles,     
                                               height: squareParticles, 
                                               type: GL.FLOAT, 
                                               magFilter: GL.NEAREST, 
                                               minFilter: GL.NEAREST, 
                                               depth: false,
                                               data: new Float32Array( simulationData ) } );

                // Setup the config and create the particle simulation shader

                particleSimulationShaderConfig.vertexShader              = result.particleSimulationShader.vertexShader;
                particleSimulationShaderConfig.fragmentShader            = result.particleSimulationShader.fragmentShader;
                particleSimulationShaderConfig.points                    = new Uint16Array( simulationPoints );
                particleSimulationShaderConfig.data.aSimulationDataXYUVs = new Float32Array( simulationDataXYUVs );
                particleSimulationShaderConfig.data.aSimulationPositions = new Float32Array( simulationPositions );
                particleSimulationShaderConfig.data.uDepthFBO            = depthFBO;
                particleSimulationShaderConfig.data.uParticlesFBO        = particlesFBO;
                
                particleSimulationShader = new GLOW.Shader( particleSimulationShaderConfig );

                // Setup the shader config for the particle render 

                particleRenderShaderConfig.vertexShader             = result.particleRenderShader.vertexShader;
                particleRenderShaderConfig.fragmentShader           = result.particleRenderShader.fragmentShader;
                particleRenderShaderConfig.triangles                = particleTriangles;
                particleRenderShaderConfig.data.aParticleUVs        = particleUVs;
                particleRenderShaderConfig.data.aParticlePositions  = particlePositions;
                particleRenderShaderConfig.data.aParticleDirections = particleDirections;
                particleRenderShaderConfig.data.aParticleNormals    = undefined;            // calculated below
                particleRenderShaderConfig.data.aParticleDarkness   = undefined;            // calculated below
                particleRenderShaderConfig.data.uParticlesFBO       = particlesFBO;
                
                // flat shade the particles, compute normals and then, because we get higher
                // element indices than 65536, split it into several shaders  
                
                var attributeDataSizes = { aParticleUVs: 2, 
                                           aParticlePositions: 3,
                                           aParticleDirections: 3,
                                           aParticleNormals: 3 };
                
                GLOW.Geometry.flatShade( particleRenderShaderConfig, attributeDataSizes );
                particleRenderShaderConfig.data.aParticleNormals  = GLOW.Geometry.faceNormals( particleRenderShaderConfig.data.aParticleDirections, particleRenderShaderConfig.triangles );
                particleRenderShaderConfig.data.aParticleDarkness = GLOW.Geometry.randomArray( particleRenderShaderConfig.triangles.length, 0.5, 0.4, 3 );
                particleRenderShaders = GLOW.ShaderUtils.createMultiple( particleRenderShaderConfig, attributeDataSizes );


                // create depth to screen shader
                // use the FBO as texture
                
                depthToScreenShaderConfig.vertexShader   = result.depthToScreenShader.vertexShader;
                depthToScreenShaderConfig.fragmentShader = result.depthToScreenShader.fragmentShader;
                depthToScreenShaderConfig.data.uFBO      = depthFBO;
                depthToScreenShader                      = new GLOW.Shader( depthToScreenShaderConfig );

                // start render

                setInterval( render, 1000 / 60 );
                
                document.onclick = function() {
                    changeAnimal = true;
                };
                
                document.onmousemove = function( e ) {
                    mouseX = ( e.clientX - window.innerWidth * 0.5 ) / window.innerWidth;
                }
                
                /*
                
                animalNode.localMatrix.setPosition( 0, -1050, -4000 );
                animalNode.localMatrix.addRotation( 0, 0.01, 0 );
                animalNode.localMatrix.scale( 0.8, 0.8, 0.8 );
                animalNode.update( undefined, cameraFBO.inverse );

                var vec4 = new GLOW.Vector4( 1000, 1000, 1000, 1 );
                
                animalNode.viewMatrix.multiplyVector4( vec4 );
                cameraFBO.projection.multiplyVector4( vec4 );
                
                console.log( vec4 );
                */
            }
        } );
    };
    
    var render = function() {
        
        // update animal, particle simulation and render nodes
        
        var rotation = Math.PI * 2 * mouseX + Math.PI * 0.5;
        
        animalNode.localMatrix.setPosition( 0, -1050, -4000 );
        animalNode.localMatrix.setRotation( 0.0, rotation, 0.0 );
        animalNode.update( undefined, cameraFBO.inverse );
        
        particleSimulationNode.localMatrix.setPosition( 0, 0, -4000 );
        particleSimulationNode.localMatrix.setRotation( 0.0, rotation, 0.0 );
        particleSimulationNode.update( undefined, cameraFBO.inverse );

        particleRenderNode.localMatrix.copy( particleSimulationNode.localMatrix );
        particleRenderNode.update( undefined, camera.inverse );
    
        // update animal animation
		
		if( changeAnimal ) {
		    animalMorph += 0.05;
		    
		    if( animalMorph >= 1.0 ) {
		        animalMorph = 0;
		        currentAnimalIndex = ( currentAnimalIndex + 1 ) % animals.length;
		        currentAnimal = animals[ currentAnimalIndex ];
		        nextAnimal    = animals[ ( currentAnimalIndex + 1 ) % animals.length ];
		        changeAnimal  = false;
		    }
		}
		
        updateAnimaion( currentAnimal );
        updateAnimaion( nextAnimal );
        
        depthShader.uAnimalMorph.set( animalMorph );
        depthShader.uFrameMorphA.set( framesByAnimal[ currentAnimal ].morph );
        depthShader.uFrameMorphB.set( framesByAnimal[ nextAnimal    ].morph );
        depthShader.uAnimalAScale.set( animalsScale[ currentAnimalIndex ] );
        depthShader.uAnimalBScale.set( animalsScale[ ( currentAnimalIndex + 1 ) % animals.length ] );
        
        depthShader.aVertexAnimalAFrame0.buffer = framesByAnimal[ currentAnimal ][ framesByAnimal[ currentAnimal ].frame0 ].vertexBuffer;
        depthShader.aVertexAnimalAFrame1.buffer = framesByAnimal[ currentAnimal ][ framesByAnimal[ currentAnimal ].frame1 ].vertexBuffer;
        depthShader.aVertexAnimalBFrame0.buffer = framesByAnimal[ nextAnimal    ][ framesByAnimal[ nextAnimal    ].frame0 ].vertexBuffer;
        depthShader.aVertexAnimalBFrame1.buffer = framesByAnimal[ nextAnimal    ][ framesByAnimal[ nextAnimal    ].frame1 ].vertexBuffer;
        depthShader.aColorAnimalA.buffer        = framesByAnimal[ currentAnimal ][ framesByAnimal[ currentAnimal ].frame0 ].colorBuffer;
        depthShader.aColorAnimalB.buffer        = framesByAnimal[ nextAnimal    ][ framesByAnimal[ nextAnimal    ].frame0 ].colorBuffer;
        
        // clear cache and we're ready to go rendering
        
		context.cache.clear();
        context.clear();

        // draw back and front animal to depth FBO
        // we draw back of volume to the left and the front
        // of the volume to the right

        context.enableDepthTest( true );
        context.setupCulling( { cullFace: GL.FRONT } );
        
        depthFBO.bind( { x: 0, width: depthFBO.width * 0.5 } );
        depthFBO.clear();

        depthShader.draw();

        depthFBO.setupViewport( { x: depthFBO.width * 0.5, width: depthFBO.width * 0.5 } );
        context.setupCulling( { cullFace: GL.BACK } );

        depthShader.draw();
        depthFBO.unbind( false );

        // update particle system and render
        
        context.enableDepthTest( false );
        
        particlesFBO.bind();
        particleSimulationShader.draw();
        particlesFBO.unbind();

        context.enableDepthTest( true );
        
        for( var i = 0; i < particleRenderShaders.length; i++ )
            particleRenderShaders[ i ].draw();

        // draw to screen (temp)

//        depthToScreenShader.draw();

        stats.update();
    }
    
    var updateAnimaion = function( animal ) {
        framesByAnimal[ animal ].time  += animationSpeed;
        framesByAnimal[ animal ].frame0 = Math.floor( framesByAnimal[ animal ].time ) % framesByAnimal[ animal ].length;
        framesByAnimal[ animal ].frame1 = Math.ceil ( framesByAnimal[ animal ].time ) % framesByAnimal[ animal ].length;
        framesByAnimal[ animal ].time  %= framesByAnimal[ animal ].length;
        framesByAnimal[ animal ].morph  = framesByAnimal[ animal ].time - framesByAnimal[ animal ].frame0;
    }
    
    return { 
        load:   load
    };
})();
