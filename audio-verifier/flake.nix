{
  description = "SONAR Audio Verifier development environment";

  inputs = {
        nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";  # Use unstable for Python 3.13 support
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
        
        # Python 3.13 (latest stable compatible with numba)
        # Note: numba only supports Python >=3.10,<3.14
        python313 = pkgs.python313;
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Python 3.13 with packages (pip is included by default)
            (python313.withPackages (ps: with ps; [
              # Core packages available in nixpkgs
              fastapi
              uvicorn
              httpx
              numpy
              # Note: Some packages like pysui-fastcrypto may not be in nixpkgs
              # and will need to be installed via pip (which is included)
            ]))
            
            # Build tools for compiling Python packages (especially pysui-fastcrypto)
            gcc
            rustc
            cargo
            pkg-config
            
            # System dependencies for audio processing
            ffmpeg
            chromaprint
            libsndfile
            
            # Bazel for build orchestration
            bazel_7
            
            # Git (needed for git dependencies)
            git
            
            # Additional build dependencies
            openssl
            zlib
          ];

          # Set up library paths for linking
          LD_LIBRARY_PATH = with pkgs; lib.makeLibraryPath [
            openssl
            zlib
            libsndfile
            ffmpeg
          ];
          
          shellHook = ''
            echo "🔧 SONAR Audio Verifier development environment"
            echo "Python version: $(python3.13 --version)"
            echo "Bazel version: $(bazel --version)"
            echo ""
            echo "Available commands:"
            echo "  pip install ."
            echo "  bazel build //:app"
            echo "  BUILD_METHOD=bazel ./build.sh"
            echo "  BUILD_METHOD=pip ./build.sh"
            echo "  BUILD_METHOD=nix ./build.sh"
          '';
        };

        # Build outputs using buildPythonApplication
        packages.default = python313.pkgs.buildPythonApplication {
          pname = "sonar-audio-verifier";
          version = "2.0.0";
          src = ./.;
          
          propagatedBuildInputs = with python313.pkgs; [
            fastapi
            uvicorn
            httpx
            numpy
            # Note: Some packages may need to be installed via pip
            # if they're not in nixpkgs
          ];
          
          buildInputs = with pkgs; [
            gcc
            rustc
            cargo
            pkg-config
            ffmpeg
            chromaprint
            libsndfile
            openssl
            zlib
            git
          ];
          
          # For packages not in nixpkgs, we'll need to use pip
          # This is a simplified version - may need custom handling
          postInstall = ''
            # Install remaining packages via pip if needed
            pip install --prefix=$out pysui google-generativeai librosa soundfile pyacoustid pydub cryptography || true
          '';
        };
      }
    );
}

