# Privacy Policy for pDoom

**Last Updated: February 12, 2026**

## Overview

pDoom ("the App") is developed by NomadJackalope (Damon Eli DeWaide). We take your privacy seriously. This policy explains what data the App collects, how it is used, and how content is generated.

## Data Collection

The App does not collect, store, or transmit any personal information. All app preferences are stored locally on your device using on-device storage.

## How Content Is Generated

pDoom displays daily AI-generated readings based on news headlines. Here is how this works:

1. An automated server-side pipeline scrapes publicly available RSS news feeds from major outlets (BBC, NPR, AP News, CNN, and others).
2. These headlines are sent to an AI model (Claude by Anthropic) for sentiment analysis on our private server.
3. The AI generates percentages, commentary, and image prompts.
4. An image generation service (DALL-E by OpenAI) creates pixel art illustrations from these prompts on our private server.
5. The resulting text and images are published as static files to GitHub Pages, a public content delivery network.
6. The App downloads these pre-made static files for display.

No user data is sent to any AI service. No personal information, device identifiers, or usage data is transmitted to Anthropic, OpenAI, GitHub, or any other third party as part of this content generation process. All AI processing occurs on our private server before the App ever accesses the content.

## Advertising

The App uses Google AdMob to display non-personalized advertisements only. AdMob may collect limited technical data (such as device type and general location at the city level) to serve ads. This data is not linked to your identity.

The App does not use App Tracking Transparency (ATT) and does not track users across apps or websites. No IDFA (Identifier for Advertisers) is collected.

## Third-Party Services

- **Google AdMob** - Displays non-personalized ads within the App. [Google Privacy Policy](https://policies.google.com/privacy)
- **GitHub Pages** - Hosts the static content files that the App downloads. No personal information is transmitted with these requests.

The following services are used server-side to generate content and do not receive any user data from the App:
- **Anthropic (Claude)** - AI model used for headline analysis (server-side only)
- **OpenAI (DALL-E)** - Image generation service (server-side only)

## Data Sharing

We do not sell, trade, or share any personal data. The App does not collect personal data to share.

## Children's Privacy

The App is not directed at children under 13. We do not knowingly collect personal information from children.

## Content Disclaimer

The readings displayed in pDoom are AI-generated interpretations of news headline sentiment. They are not predictions, scientific measurements, or risk assessments. They are provided for entertainment and discussion purposes only.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected in the "Last Updated" date above.

## Contact

support@nomadjackalope.io
