# Edge Caddy with two plugins the stock image lacks:
#  - caddy-dns/cloudflare: ACME DNS-01 through the Cloudflare API, so Caddy gets
#    publicly trusted certificates while Cloudflare proxies the hostnames
#    (HTTP-01/TLS-ALPN challenges do not reach an origin behind the orange cloud).
#  - mholt/caddy-ratelimit: per-client rate limiting in front of the API.
ARG CADDY_VERSION=2.10.2
FROM caddy:${CADDY_VERSION}-builder AS builder
RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare \
    --with github.com/mholt/caddy-ratelimit

FROM caddy:${CADDY_VERSION}-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
