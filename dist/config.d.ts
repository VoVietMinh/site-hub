import 'dotenv/config';
interface SessionConfig {
    secret: string;
    cookieMaxAge: number;
}
interface EasyEngineConfig {
    binary: string;
    ssh: {
        enabled: boolean;
        host: string;
        user: string;
        keyPath: string;
    };
}
interface AppConfig {
    env: string;
    appName: string;
    port: number;
    session: SessionConfig;
    database: {
        url: string;
    };
    superAdmin: {
        username: string;
        password: string;
        email: string;
    };
    i18n: {
        defaultLocale: string;
        supportedLocales: string[];
    };
    easyEngine: EasyEngineConfig;
    n8n: {
        webhookUrl: string;
        webhookToken: string;
    };
    ai: {
        provider: string;
        apiKey: string;
        model: string;
    };
    images: {
        serperApiKey: string;
    };
    cse: {
        apiKey: string;
        cx: string;
    };
    articles: {
        defaultOutlineCount: number;
        defaultTone: string;
        sectionWordsMin: number;
        sectionWordsMax: number;
        tagCreateDelayMs: number;
    };
    wpApiHost: string;
}
declare const config: AppConfig;
export default config;
