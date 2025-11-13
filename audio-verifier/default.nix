# Fallback default.nix for non-flake Nix usage
# Provides Python 3.13 with pip and all build dependencies

let
  pkgs = import <nixpkgs> {};
in

pkgs.mkShell {
  buildInputs = with pkgs; [
    # Python 3.13 with pip
    (python313.withPackages (ps: with ps; [
      pip
      # Add packages available in nixpkgs here
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
}

