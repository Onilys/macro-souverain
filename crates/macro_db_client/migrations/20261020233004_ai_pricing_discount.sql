-- Per-model discounts on AI pricing. Every price read goes through
-- ai_effective_pricing, which applies a model's discount to all its rates, so
-- usage is recorded and recomputed at the discounted price. Usage already
-- recorded keeps its price until set_pricing recomputes the model.
CREATE TABLE ai_pricing_discount (
    model TEXT PRIMARY KEY REFERENCES ai_pricing (model) ON DELETE CASCADE,
    discount_percent SMALLINT NOT NULL CHECK (discount_percent BETWEEN 0 AND 100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE VIEW ai_effective_pricing AS
SELECT
    p.model,
    (p.price_per_million_in::numeric * f.factor)::real AS price_per_million_in,
    (p.price_per_million_out::numeric * f.factor)::real AS price_per_million_out,
    (p.price_per_million_cache_read::numeric * f.factor)::real AS price_per_million_cache_read,
    (p.price_per_million_cache_write::numeric * f.factor)::real AS price_per_million_cache_write,
    (p.price_per_audio_minute::numeric * f.factor)::real AS price_per_audio_minute
FROM ai_pricing p
LEFT JOIN ai_pricing_discount d ON d.model = p.model
CROSS JOIN LATERAL (SELECT 1 - COALESCE(d.discount_percent, 0) / 100.0 AS factor) f;

INSERT INTO ai_pricing_discount (model, discount_percent)
SELECT model, 30 FROM ai_pricing WHERE model = 'gemini-3.8-flash'
ON CONFLICT (model) DO NOTHING;
