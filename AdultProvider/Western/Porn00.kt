// ! Bu araç @kerimmkirac tarafından | @Cs-GizliKeyif için yazılmıştır.

package com.lagradost.cloudstream3.AdultProvider.Western

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.webkit.WebViewClient
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.module.kotlin.readValue
import org.jsoup.nodes.Element
import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.utils.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

class Porn00(context: Context) : MainAPI() {
    override var mainUrl              = "https://www.porn00.org"
    override var name                 = "Porn00"
    override val hasMainPage          = true
    override var lang                 = "en"
    override val hasQuickSearch       = false
    override val supportedTypes       = setOf(TvType.NSFW)
    override val vpnStatus            = VPNStatus.MightBeNeeded
    private val appContext = context

    override val mainPage = mainPageOf(
        "${mainUrl}/latest-vids"      to "Latest Porn Videos",
        "${mainUrl}/popular-vids"   to "Most Viewed Porn Videos",
        "${mainUrl}/top-vids" to "Top Rated Porn Videos",
        "${mainUrl}/category-name/4k"  to "4K Porn Videos",
        "${mainUrl}/category-name/amateur"  to "Amateur Porn Videos",
        "${mainUrl}/category-name/asian"  to "Asian Porn Videos",
        "${mainUrl}/category-name/big-ass"  to "Big Ass Porn Videos",
        "${mainUrl}/category-name/big-tits"  to "Big Tits Porn Videos",
        "${mainUrl}/category-name/brazilian"  to "Brazilian Porn Videos",
        "${mainUrl}/category-name/brunette"  to "Brunette Porn videos",
        "${mainUrl}/category-name/gym"  to "Gym Porn Videos",
        "${mainUrl}/category-name/latina"  to "Latina Porn Videos",
        "${mainUrl}/category-name/lingerie"  to "Lingerie Porn Videos",
        "${mainUrl}/category-name/stepmom"  to "Stepmom Porn Videos",
        "${mainUrl}/category-name/stepsister"  to "Stepsister Porn Videos",
        "${mainUrl}/category-name/tittyfuck"  to "Tittyfuck Porn Videos",
        "${mainUrl}/category-name/doggystyle"  to "Doggystyle Porn Videos",
    )

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse {
        val document = app.get("${request.data}/$page").document
        val home     = document.select("div.item").mapNotNull { it.toMainPageResult() }

        return newHomePageResponse(request.name, home)
    }

    private fun Element.toMainPageResult(): SearchResponse? {
        val anchor = this.selectFirst("a") ?: return null
        val title = anchor.attr("title")?.trim() ?: return null
        val href = fixUrlNull(anchor.attr("href")) ?: return null
        val posterUrl = fixUrlNull(this.selectFirst("img")?.attr("data-original"))

        return newMovieSearchResponse(title, href, TvType.NSFW) {
            this.posterUrl = posterUrl
        }
    }


    override suspend fun search(query: String, page: Int): SearchResponseList {
        val document = app.get("${mainUrl}/searching/${query}/?from_videos=$page").document

        val aramaCevap = document.select("div.item").mapNotNull { it.toSearchResult() }
        return newSearchResponseList(aramaCevap, hasNext = true)
    }

    private fun Element.toSearchResult(): SearchResponse? {
        val anchor = this.selectFirst("a") ?: return null
        val title = anchor.attr("title")?.trim() ?: return null
        val href = fixUrlNull(anchor.attr("href")) ?: return null
        val posterUrl = fixUrlNull(this.selectFirst("img")?.attr("data-original"))

        return newMovieSearchResponse(title, href, TvType.NSFW) {
            this.posterUrl = posterUrl
        }
    }

    override suspend fun quickSearch(query: String): List<SearchResponse>? = search(query)

   private fun parseFlashvars(html: String): Map<String, String> {
        val flashvarsRegex = Regex("""var flashvars = \{(.*?)\};""", RegexOption.DOT_MATCHES_ALL)
        val flashvarsMatch = flashvarsRegex.find(html) ?: return emptyMap()
        
        val flashvarsContent = flashvarsMatch.groupValues[1]
        val result = mutableMapOf<String, String>()
        
        val keyValueRegex = Regex("""(\w+):\s*'([^']*)'""")
        keyValueRegex.findAll(flashvarsContent).forEach { match ->
            val key = match.groupValues[1]
            val value = match.groupValues[2]
            result[key] = value
        }
        
        return result
    }

    override suspend fun load(url: String): LoadResponse? {
        val document = app.get(url).document
        val html = document.html()

        val flashvars = parseFlashvars(html)

        val title = flashvars["video_title"] ?: return null
        val previewUrl = flashvars["preview_url"]

        
        val description = document.selectFirst("div.info div.item")?.let { element ->
            val text = element.text()
            if (text.contains("Description:")) {
                text.substringAfter("Description:").trim()
            } else null
        }
        
        val recommendations = document.select("div.list-videos div.item").mapNotNull { it.toRecommendationResult() }
        
        val categories = document.select("div.info div.item:contains(Categories:) a").map { 
            it.text().trim() 
        }
        
        val tags = document.select("div.info div.item:contains(Tags:) a").map { 
            it.text().trim() 
        }
        
        val allTags = (categories + tags).filter { it.isNotEmpty() }
        
        return newMovieLoadResponse(title, url, TvType.NSFW, url) {
            this.posterUrl = previewUrl
            this.plot = description
            this.tags = allTags
            this.recommendations = recommendations
            
        }
    }

    private fun Element.toRecommendationResult(): SearchResponse? {
        val anchor = this.selectFirst("a") ?: return null
        val title = anchor.attr("title")?.trim() ?: return null
        val href = fixUrlNull(anchor.attr("href")) ?: return null
        val posterUrl = fixUrlNull(this.selectFirst("img")?.attr("data-original"))

        return newMovieSearchResponse(title, href, TvType.NSFW) {
            this.posterUrl = posterUrl
        }
    }

    private fun cleanupWebView(wv: WebView) {
        try {
            wv.stopLoading()
            wv.setWebChromeClient(null)
            wv.webViewClient = object : WebViewClient() {}
            wv.removeAllViews()
            wv.clearHistory()
            wv.loadUrl("about:blank")
            wv.destroy()
        } catch (ignored: Throwable) {
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    suspend fun createWebViewAndExtractVideo(
        context: Context,
        html: String,
        onResult: (String?) -> Unit
    ): WebView = withContext(Dispatchers.Main) {

        val wv = WebView(context.applicationContext).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            settings.allowContentAccess = true

            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    extractVideoWithDelay(view, { result ->
                        onResult(result)
                        Handler(Looper.getMainLooper()).post {
                            cleanupWebView(this@apply)
                        }
                    }, 0)
                }
            }

            loadDataWithBaseURL("https://www.porn00.org/", html, "text/html", "UTF-8", null)
        }

        return@withContext wv
    }

    private fun extractVideoWithDelay(webView: WebView?, onResult: (String?) -> Unit, attempt: Int) {
        if (webView == null || attempt > 3) {
            onResult(null)
            return
        }

        val extractScript = """
            (function() {
                try {
                    var results = [];
                    
                    if (typeof flashvars !== 'undefined' && flashvars) {
                        // 360p
                        if (flashvars.video_url) {
                            var videoUrl = flashvars.video_url;
                            if (videoUrl.startsWith('function/0/')) {
                                videoUrl = videoUrl.substring(11);
                            }
                            if (videoUrl.endsWith('/')) {
                                videoUrl = videoUrl.slice(0, -1);
                            }
                            var quality = flashvars.video_url_text || '360p';
                            results.push({
                                url: videoUrl,
                                quality: quality
                            });
                        }
                        
                        // 720p
                        if (flashvars.video_alt_url) {
                            var altUrl = flashvars.video_alt_url;
                            if (altUrl.startsWith('function/0/')) {
                                altUrl = altUrl.substring(11);
                            }
                            if (altUrl.endsWith('/')) {
                                altUrl = altUrl.slice(0, -1);
                            }
                            var altQuality = flashvars.video_alt_url_text || '720p';
                            results.push({
                                url: altUrl,
                                quality: altQuality
                            });
                        }
                    }
                    
                    return results.length > 0 ? JSON.stringify(results) : null;
                    
                } catch (e) {
                    console.log('Extract error:', e);
                    return null;
                }
            })();
        """.trimIndent()

        webView.evaluateJavascript(extractScript) { resultJson ->
            val cleanResult = resultJson?.let { raw ->
                if (raw == "null" || raw == "\"null\"") {
                    null
                } else {
                    raw.removePrefix("\"").removeSuffix("\"")
                        .replace("\\\"", "\"")
                        .replace("\\\\", "\\")
                }
            }

            if (cleanResult.isNullOrEmpty() || cleanResult == "null") {
                if (attempt < 20) {
                    Handler(Looper.getMainLooper()).postDelayed({
                        extractVideoWithDelay(webView, onResult, attempt + 1)
                    }, 1000)
                } else {
                    onResult(null)
                }
            } else {
                val finalUrl = if (cleanResult.startsWith("function/0/")) {
                    cleanResult.removePrefix("function/0/")
                } else {
                    cleanResult
                }
                onResult(finalUrl)
            }
        }
    }

    override suspend fun loadLinks(
        data: String,
        isCasting: Boolean,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit
    ): Boolean {
        val pageHtml = app.get(data).text

        val videoResultJson = suspendCoroutine { continuation ->
            runBlocking {
                createWebViewAndExtractVideo(appContext, pageHtml) { result ->
                    continuation.resume(result)
                }
            }
        }

        videoResultJson?.let { jsonResult ->
            try {
                val videoList = mapper.readValue<List<VideoQuality>>(jsonResult)

                videoList?.forEach { video ->
                    if (video.url.startsWith("http")) {

                        callback.invoke(
                            newExtractorLink(
                                source = "Porn00",
                                name = "Porn00",
                                url = video.url,
                                type = ExtractorLinkType.VIDEO,
                            ) {
                                this.referer = "${mainUrl}/"
                                quality = getQualityFromName(video.quality)
                            })
                    }
                }
                return videoList.isNotEmpty()

            } catch (e: Exception) {
                return false
            }
        }

        return false
    }
}

data class VideoQuality(
    @param:JsonProperty("url") val url: String,
    @param:JsonProperty("quality") val quality: String
)
