from pathlib import Path
import re

path = Path('/home/ubuntu/market-event-intelligence/app/(tabs)/index.tsx')
text = path.read_text()

tracked_pattern = re.compile(r'\{trackedNews\.isFetching \|\| newsRefresh\.isPending \? <Text style=\{styles\.finnhubState\}>Refreshing verified news for \{newsLookupSymbol\}…</Text> : trackedNews\.data\?\.articles\?\.length \? <View style=\{styles\.newsList\}>.*?</View> : <Text style=\{styles\.finnhubState\}>', re.S)
tracked_replacement = '{trackedNews.isFetching || newsRefresh.isPending ? <Text style={styles.finnhubState}>Refreshing verified news for {newsLookupSymbol}…</Text> : trackedNews.data?.articles?.length ? <ScrollView horizontal pagingEnabled decelerationRate="fast" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.newspaperRail} accessibilityLabel="Swipe selected stock headlines">{trackedNews.data.articles.map((item) => <NewspaperArticleCard key={item.id} article={item} onPress={() => setSelectedNewsArticle(item)} />)}</ScrollView> : <Text style={styles.finnhubState}>'
text, tracked_count = tracked_pattern.subn(tracked_replacement, text, count=1)

archive_pattern = re.compile(r'\{newsArchive\.isLoading \? <Text style=\{styles\.finnhubState\}>Loading the stored A–Z news archive…</Text> : archiveArticles\.length \? <View style=\{styles\.newsList\}>.*?</View> : <Text style=\{styles\.finnhubState\}>No archived verified news is available for this scope yet\.</Text>\}', re.S)
archive_replacement = '{newsArchive.isLoading ? <Text style={styles.finnhubState}>Loading the stored A–Z news archive…</Text> : archiveArticles.length ? <ScrollView horizontal pagingEnabled decelerationRate="fast" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.newspaperRail} accessibilityLabel="Swipe verified news archive headlines">{archiveArticles.map((item) => <NewspaperArticleCard key={item.id} article={item} onPress={() => setSelectedNewsArticle(item)} />)}</ScrollView> : <Text style={styles.finnhubState}>No archived verified news is available for this scope yet.</Text>}'
text, archive_count = archive_pattern.subn(archive_replacement, text, count=1)

if tracked_count != 1 or archive_count != 1:
    raise SystemExit(f'Expected one replacement for each feed, got tracked={tracked_count}, archive={archive_count}')
path.write_text(text)
