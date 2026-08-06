# Passkey runtime wheels

These wheels are installed locally by `Dockerfile` so a production deployment
does not depend on PyPI availability. They were downloaded from the official
PyPI file host and verified against the SHA-256 digest from the PyPI JSON API.

- `webauthn-2.2.0-py3-none-any.whl` — `e8e2daace85dde8f6fb436c1bca9aa72d5931dac8829ecc1562cc4e7cc169f6c`
- `asn1crypto-1.5.1-py2.py3-none-any.whl` — `db4e40728b728508912cbb3d44f19ce188f218e9eba635821bb4b68564f8fd67`
- `pyopenssl-25.3.0-py3-none-any.whl` — `1fda6fc034d5e3d179d39e59c1895c9faeaf40a79de5fc4cbbfbe0d36f4a77b6`
- `cbor2-5.7.1-cp310-cp310-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl` — `4fc3d3f00aed397a1e4634b8e1780f347aad191a2e1e7768a233baadd4f87561`

The binary `cbor2` wheel targets the CPython 3.10 x86_64 Linux runtime used by
the production Docker image.
