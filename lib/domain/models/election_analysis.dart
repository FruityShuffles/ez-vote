import 'package:flutter/material.dart';

class ElectionAnalysis {
  final String headline;
  final String summary;
  final List<AnalysisInsight> insights;

  const ElectionAnalysis({
    required this.headline,
    required this.summary,
    required this.insights,
  });
}

class AnalysisInsight {
  final String title;
  final String body;
  final IconData icon;

  const AnalysisInsight({
    required this.title,
    required this.body,
    required this.icon,
  });
}
