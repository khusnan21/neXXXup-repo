
const baseUrl = "https://01ntn.cc";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    const res = await http_get(baseUrl + "/genre/adult/page/1/", getHeaders());
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
    const items = html.split(/<article[^>]*class=["'][^"']*(?:item|result-item|movie-item|ml-item)[^"']*["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/<h[23][^>]*>(?:<a[^>]*>)?(.*?)(?:<\/a>)?<\/h[23]>/i) || item.match(/alt=["']([^"']+)["']/i);
        let imgMatch = item.match(/src=["']([^"']+)["']/i);
        
        if (aTag) {
            let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
            let url = aTag[1];
            results.push({
                url: url,
                title: title,
                poster: imgMatch ? imgMatch[1] : ''
            });
        }
    }
    return results;
}

export async function load(url) {
    const res = await http_get(url, getHeaders());
    
    let title = url;
    const titleMatch = res.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    let links = [];
    const ajaxParams = [];
    const metaRegex = /data-(?:post|id)=["'](\d+)["'][\s\S]*?data-(?:nume|server|episode)=["'](\d+)["']/g;
    let match;
    while ((match = metaRegex.exec(res)) !== null) {
        let typeMatch = res.substring(match.index).match(/data-type=["']([a-zA-Z0-9_-]+)["']/);
        ajaxParams.push({
            post: match[1],
            nume: match[2],
            type: typeMatch ? typeMatch[1] : "movie"
        });
    }

    if(ajaxParams.length > 0) {
        for(let p of ajaxParams) {
             links.push(`ajax_nonton01::${p.post}::${p.nume}::${p.type}`);
        }
    } else {
         links.push(url);
    }
    
    // Check for inline iframes
    const iframes = res.match(/<iframe[^>]+src=["']([^"']+)["']/gi);
    if(iframes) {
        for(let iframe of iframes) {
            const m = iframe.match(/src=["']([^"']+)["']/);
            if(m && !m[1].includes("blank")) {
                links.push("iframe:" + m[1]);
            }
        }
    }

    // Deduplicate array
    links = [...new Set(links)];

    return {
        url: url,
        title: title,
        links: links,
        isMovie: true
    };
}

export async function loadLinks(url) {
    const results = [];
    
    if(url.startsWith("iframe:")) {
        let embed = url.substring(7);
         if(embed.startsWith("//")) {
             embed = "https:" + embed;
         }
         return await loadExtractor(embed);
    } else if(url.startsWith("ajax_nonton01::")) {
        const parts = url.split("::");
        const postId = parts[1];
        const nume = parts[2];
        const type = parts[3];
        
        const ajaxUrl = `${baseUrl}/wp-admin/admin-ajax.php`;
        const postData = `action=doo_player_ajax&post=${postId}&nume=${nume}&type=${type}`;
        
        const res = await http_post(ajaxUrl, {
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": baseUrl,
            "X-Requested-With": "XMLHttpRequest",
            "Origin": baseUrl,
            "User-Agent": getHeaders()["User-Agent"]
        }, postData);
        
        try {
            const data = JSON.parse(res);
            if (data.embed_url) {
                let embed = data.embed_url;
                const iframeMatch = embed.match(/src=["']([^"']+)["']/);
                if (iframeMatch) {
                    embed = iframeMatch[1];
                }
                if(embed.startsWith("//")) embed = "https:" + embed;
                
                if(embed.includes("cinemaz") || embed.includes("01player.cc") || embed.includes("abyssplayer.com")) {
                     results.push({
                         url: embed,
                         quality: "Link",
                         isM3U8: false
                     });
                     // Would need full abyssplayer reverse engineering, but standard extractors might help
                } else {
                     return await loadExtractor(embed);
                }
            } else if (res.includes("<iframe")) {
                  const iframeMatch = res.match(/src=["']([^"']+)["']/);
                  if (iframeMatch) {
                      let embed = iframeMatch[1];
                      if (embed.startsWith("//")) embed = "https:" + embed;
                      return await loadExtractor(embed);
                  }
            }
        } catch(e) {}
    } else {
        const res = await http_get(url, getHeaders());
        const iframes = res.match(/<iframe[^>]+src=["']([^"']+)["']/gi);
        if (iframes) {
            for (const frame of iframes) {
                const srcMatch = frame.match(/src=["']([^"']+)["']/);
                if (srcMatch && !srcMatch[1].includes("blank")) {
                    let embed = srcMatch[1];
                    if(embed.startsWith("//")) {
                        embed = "https:" + embed;
                    }
                    const extr = await loadExtractor(embed);
                    if (extr) {
                        extr.forEach(e => results.push(e));
                    }
                }
            }
        }
    }
    
    return results;
}
