# Fallback default.nix for non-flake Nix usage
# Prefer using flake.nix with `nix develop` or `nix build`

{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    # Rust 1.83.0
    (rust-bin.stable."1.83.0".default.override {
      extensions = [ "rust-src" "rustfmt" "clippy" ];
    })
    
    # System dependencies
    openssl
    pkg-config
    libpq
    python3
    socat
    curl
    
    # Build tools
    cargo
    rustc
    git
  ];

  CARGO_NET_GIT_FETCH_WITH_CLI = "true";
  
  LD_LIBRARY_PATH = with pkgs; lib.makeLibraryPath [
    openssl
    libpq
  ];
}

