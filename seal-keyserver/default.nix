# Fallback default.nix for non-flake Nix usage
# Uses rust-overlay for Rust nightly to support unstable features

let
  rust-overlay = import (builtins.fetchTarball "https://github.com/oxalica/rust-overlay/archive/master.tar.gz");
  pkgs = import <nixpkgs> {
    overlays = [ rust-overlay ];
  };
in

pkgs.mkShell {
  buildInputs = with pkgs; [
    # Use Rust nightly for unstable features support (required by sui-sdk-types)
    (rust-bin.selectLatestNightlyWith (toolchain: toolchain.default.override {
      extensions = [ "rust-src" ];
    }))
    
    # System dependencies
    openssl
    pkg-config
    libpq
    python3
    socat
    curl
    
    # Build tools
    git
  ];

  CARGO_NET_GIT_FETCH_WITH_CLI = "true";
  
  LD_LIBRARY_PATH = with pkgs; lib.makeLibraryPath [
    openssl
    libpq
  ];
}

