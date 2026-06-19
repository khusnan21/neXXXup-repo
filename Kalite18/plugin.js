import { http_get, http_post } from "../utils/network.js";

const baseUrl = "https://www.kalite18.net";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl + "/",
    };
}

export async function getHome() {
    const res = await http_get(baseUrl + "/?filter=latest", getHeaders());
    const results = parseList(res);
    return [{ title: "Latest", list: results }];
}

export async function search(query) {
    const url = `${baseUrl}/?s=${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const articles = html.split(/<article[^>]*>/i);
    for (let i = 1; i < articles.length; i++) {
        const item = articles[i];
        const hrefMatch = item.match(/href=["'](https?:\/\/[^"']+)["']/);
        const titleMatch = item.match(/<header[^>]*>[\s\S]*?<span[^>]*>(.*?)<\/span>/i) || item.match(/<a[^>]*title=["']([^"']+)["']/i);
        const imgMatch = item.match(/data-src=["']([^"']+)["']/) || item.match(/<img[^>]+src=["']([^"']+)["']/);
        
        if (hrefMatch && titleMatch) {
            let title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
            results.push({
                url: hrefMatch[1],
                title: title,
                poster: imgMatch ? imgMatch[1] : ''
            });
        }
    }
    return results;
}

export async function load(url) {
    const res = await http_get(url, getHeaders());
    
    const titleMatch = res.match(/<h1[^>]*>(.*?)<\/h1>/);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : url;
    
    const descMatch = res.match(/<div class="desc"[^>]*>[\s\S]*?<p>(.*?)<\/p>/);
    let description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : "";
    
    return {
        url: url,
        title: title,
        description: description,
        links: [url],
        isMovie: true
    };
}

export async function loadLinks(url) {
    const res = await http_get(url, getHeaders());
    const iframeMatch = res.match(/<iframe[^>]+src=["']([^"']+)["']/);
    
    const results = [];
    
    if (iframeMatch) {
        const iframeUrl = iframeMatch[1];
        const vidMatch = iframeUrl.match(/vid=([a-zA-Z0-9]+)/);
        if (vidMatch) {
            const vid = vidMatch[1];
            
            const postHeaders = {
                "X-Requested-With": "XMLHttpRequest",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Referer": iframeUrl,
                "Origin": "https://play.vidvod.xyz",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            };
            
            const postData = `vid=${vid}&alternative=mp4&ord=0`;
            const apiRes = await http_post("https://play.vidvod.xyz/ajax_sources.php", postHeaders, postData);
            
            try {
                const json = JSON.parse(apiRes);
                if (json.source && json.source.length > 0) {
                    for (const s of json.source) {
                        let fileUrl = decodeURIComponent(s.file);
                        results.push({
                            url: fileUrl,
                            quality: s.label || "MP4",
                            isM3U8: fileUrl.includes(".m3u8"),
                        });
                    }
                }
            } catch(e) {}
        }
    }
    
    return results;
}
