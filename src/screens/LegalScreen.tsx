import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import BackButton from '../components/BackButton';
import LegalFooter from '../components/LegalFooter';

type LegalTab = 'terms' | 'privacy';

const TABS: Array<{ key: LegalTab; label: string }> = [
  { key: 'terms', label: 'Terms of Service' },
  { key: 'privacy', label: 'Privacy Policy' },
];

const EFFECTIVE_DATE = 'March 3, 2026';
const CONTACT_BLOCK =
  'Apex Approach Advisory LLC\n2222 W. Grand River Ave, Ste A\nOkemos, MI 48864, USA\nContact.Us@ApexApproachAdvisory.com';

const TERMS_SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: '1. Overview',
    body: 'Then Press Me ("the App") is owned and operated by Apex Approach Advisory LLC ("Apex," "we," "our," "us"). These Terms govern your use of the App and related services.',
  },
  {
    heading: '2. Description of Service',
    body: 'Then Press Me provides digital tools for golfers to track wagers, presses, skins, scoring, settlements, leaderboards, and performance history.',
  },
  { heading: '3. Eligibility', body: 'You must be 13 or older to use the App.' },
  {
    heading: '4. User Accounts',
    body: 'Users may create accounts using email or third-party authentication. You are responsible for maintaining account security.',
  },
  {
    heading: '5. Intellectual Property',
    body: 'All content, code, features, and branding within Then Press Me are the exclusive property of Apex Approach Advisory LLC.',
  },
  {
    heading: '6. User Content',
    body: 'You retain rights to any content you input (scores, bets, notes). You grant Apex a license to store and display this content within the App.',
  },
  { heading: '7. Prohibited Use', body: 'You may not reverse engineer, copy, or redistribute the App.' },
  {
    heading: '8. Disclaimers',
    body: 'The App is provided "as is" without warranties of any kind. Apex is not responsible for financial disputes between players.',
  },
  {
    heading: '9. Limitation of Liability',
    body: 'Apex is not liable for losses, damages, or disputes arising from use of the App.',
  },
  { heading: '10. Governing Law', body: 'These Terms are governed by the laws of Michigan.' },
  { heading: '11. Contact', body: CONTACT_BLOCK },
];

const PRIVACY_SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: '1. Information We Collect',
    body: '• Account information (email, username)\n• Gameplay data (scores, bets, presses, skins, settlements)\n• Device information\n• Optional analytics data',
  },
  {
    heading: '2. How We Use Information',
    body: '• To operate the App\n• To provide scoring, bet tracking, and settlement features\n• To improve performance and user experience\n• To maintain historical records for users',
  },
  { heading: '3. Data Storage', body: 'Data is stored securely using Firebase.' },
  {
    heading: '4. Sharing',
    body: 'We do not sell user data.\nData may be shared with service providers strictly for App functionality.',
  },
  { heading: '5. Security', body: 'We use industry-standard security measures to protect user data.' },
  { heading: '6. User Rights', body: 'Users may request deletion of their account and associated data.' },
  { heading: '7. Contact', body: CONTACT_BLOCK },
];

// Terms of Service + Privacy Policy in one screen, reachable from Welcome
// (before you've even set up a profile) and from Profile (any time after).
// Content lives here as plain data rather than being fetched from
// anywhere - update these two arrays directly whenever the legal text
// changes, same as the copy in the RTF documents this was built from.
export default function LegalScreen({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<LegalTab>('terms');
  const sections = activeTab === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  const title = activeTab === 'terms' ? 'Terms of Service' : 'Privacy Policy';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>Legal</Text>

        <View style={styles.tabBar}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabButtonText, activeTab === tab.key && styles.tabButtonTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.docTitle}>{title}</Text>
        <Text style={styles.docMeta}>Effective Date: {EFFECTIVE_DATE}</Text>
        <Text style={styles.docMeta}>Owned and Operated By: Apex Approach Advisory LLC</Text>

        {sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.sectionHeading}>{section.heading}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <LegalFooter />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 12,
    color: '#234',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#fff',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#889',
  },
  tabButtonTextActive: {
    color: '#234',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  docTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#234',
    marginTop: 8,
    marginBottom: 4,
  },
  docMeta: {
    fontSize: 12,
    color: '#889',
  },
  section: {
    marginTop: 16,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#234',
    marginBottom: 4,
  },
  sectionBody: {
    fontSize: 13,
    color: '#456',
    lineHeight: 19,
  },
});
