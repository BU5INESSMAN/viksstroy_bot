"""Narrow, production-oriented WebAuthn helpers for passwordless login."""

import json
import os
from urllib.parse import urlparse

from webauthn import (
    base64url_to_bytes,
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.cose import COSEAlgorithmIdentifier
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)


def passkey_config() -> tuple[str, str, str]:
    origin = os.getenv(
        "PASSKEY_ORIGIN",
        os.getenv("WEB_APP_URL", "https://n.viksstroy.online"),
    ).strip().rstrip("/")
    rp_id = os.getenv("PASSKEY_RP_ID", "").strip() or (urlparse(origin).hostname or "")
    rp_name = os.getenv("PASSKEY_RP_NAME", "ВиКС").strip() or "ВиКС"
    if not rp_id or not origin.startswith("https://"):
        raise RuntimeError("Passkey requires a configured HTTPS origin and RP ID")
    return rp_id, origin, rp_name


def registration_options(
    *, user_name: str, display_name: str, user_handle_hex: str,
    credential_ids: list[str],
) -> dict:
    rp_id, _, rp_name = passkey_config()
    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=rp_name,
        user_id=bytes.fromhex(user_handle_hex),
        user_name=user_name,
        user_display_name=display_name,
        timeout=60_000,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(credential_id))
            for credential_id in credential_ids
        ],
        # The two broadly supported algorithms keep verification predictable.
        supported_pub_key_algs=[
            COSEAlgorithmIdentifier.ECDSA_SHA_256,
            COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
        ],
    )
    return json.loads(options_to_json(options))


def authentication_options() -> dict:
    rp_id, _, _ = passkey_config()
    options = generate_authentication_options(
        rp_id=rp_id,
        timeout=60_000,
        # No allowCredentials list: only discoverable credentials are created,
        # so the platform can offer the correct account without a username.
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return json.loads(options_to_json(options))


def verify_registration(*, credential: dict, challenge: str):
    rp_id, origin, _ = passkey_config()
    return verify_registration_response(
        credential=credential,
        expected_challenge=base64url_to_bytes(challenge),
        expected_rp_id=rp_id,
        expected_origin=origin,
        require_user_verification=True,
        supported_pub_key_algs=[
            COSEAlgorithmIdentifier.ECDSA_SHA_256,
            COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
        ],
    )


def verify_authentication(
    *, credential: dict, challenge: str, public_key: bytes, sign_count: int,
):
    rp_id, origin, _ = passkey_config()
    return verify_authentication_response(
        credential=credential,
        expected_challenge=base64url_to_bytes(challenge),
        expected_rp_id=rp_id,
        expected_origin=origin,
        credential_public_key=public_key,
        credential_current_sign_count=sign_count,
        require_user_verification=True,
    )


def enum_value(value) -> str:
    return getattr(value, "value", str(value))
