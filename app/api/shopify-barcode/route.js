// app/api/shopify-barcode/route.js
// Endpoint servidor: recibe un barcode, consulta Shopify Admin API, devuelve producto.
// El Admin token NUNCA sale al cliente — solo vive en el servidor.
//
// Uso desde el cliente:
//   const res = await fetch(`/api/shopify-barcode?barcode=7891010717981`);
//   const { producto } = await res.json();

import { NextResponse } from 'next/server';

const SHOPIFY_DOMAIN    = '313e12-3.myshopify.com';
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN; // guárdalo en .env.local

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const barcode = searchParams.get('barcode');

  if (!barcode) {
    return NextResponse.json({ error: 'Falta el parámetro barcode' }, { status: 400 });
  }

  if (!SHOPIFY_ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Token de Admin no configurado' }, { status: 500 });
  }

  try {
    // Shopify Admin API REST — buscar variantes por barcode
    const url = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/variants.json?fields=id,title,barcode,price,product_id,image_id&limit=5`;

    // La Admin REST API no filtra por barcode directamente en variants.json,
    // así que usamos GraphQL Admin API que sí lo soporta.
    const query = `
      {
        productVariants(first: 1, query: "barcode:${barcode}") {
          edges {
            node {
              id
              title
              barcode
              price
              product {
                id
                title
                handle
                featuredImage {
                  url
                }
              }
              image {
                url
              }
            }
          }
        }
      }
    `;

    const res = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type':         'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        },
        body: JSON.stringify({ query }),
        // No cachear — datos en tiempo real
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error('Shopify Admin API error:', res.status, text);
      return NextResponse.json({ error: 'Error consultando Shopify' }, { status: 502 });
    }

    const json  = await res.json();
    const edges = json?.data?.productVariants?.edges || [];

    if (edges.length === 0) {
      return NextResponse.json({ producto: null });
    }

    const variant = edges[0].node;
    const product = variant.product;

    // Extraer numeric ID del GID
    const variantId = variant.id.replace('gid://shopify/ProductVariant/', '');

    return NextResponse.json({
      producto: {
        title:      product.title,
        variantId,
        price:      variant.price,
        currency:   'CLP',
        image:      variant.image?.url || product.featuredImage?.url || null,
        productUrl: `https://moonbow.cl/products/${product.handle}`,
        cartUrl:    `https://moonbow.cl/cart/add?id=${variantId}&quantity=1`,
      },
    });

  } catch (e) {
    console.error('shopify-barcode route error:', e);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
