var jsPsych = initJsPsych();

async function startExperiment() {
    jsPsych.data.addProperties({
        task_name: 'Local-Global Demo',
        timestamp: new Date().toISOString()
    });

    var stimuliData = await loadStimuliData();
    if (!stimuliData) {
        jsPsych.getDisplayElement().innerHTML = '<p>Error: Could not load task data.</p>';
        return;
    }

    var timeline_variables = createTimelineVariables(stimuliData);
    var timeline = [];

    // Preload
    timeline.push({
        type: jsPsychPreload,
        images: ['stimulus/blank.png', 'stimulus/Blue_BIGH_h.png', 'stimulus/Blue_BIGH_s.png', 'stimulus/Blue_BIGS_h.png', 'stimulus/Blue_BIGS_s.png', 'stimulus/Green_BIGH_h.png', 'stimulus/Green_BIGH_s.png', 'stimulus/Green_BIGS_h.png', 'stimulus/Green_BIGS_s.png']
    });

    // Instructions
    timeline.push({ 
        type: jsPsychHtmlButtonResponse, 
        stimulus: '<h1>Local-Global Task</h1><p>Data-Informed Performance Analysis</p>', 
        choices: ['Next'],
        button_html: '<button class="jspsych-btn instruction-button">%choice%</button>'
    });
    
    timeline.push({
        type: jsPsychHtmlButtonResponse,
        stimulus: '<div class="main-text">' +
            '<p>1. <strong style="color: #3498db;">BLUE</strong>: Focus on <strong>LARGE</strong> letter.</p>' +
            '<p>2. <strong style="color: #2ecc71;">GREEN</strong>: Focus on <strong>SMALL</strong> letters.</p></div>',
        choices: ['Start Task'],
        button_html: '<button class="jspsych-btn instruction-button">%choice%</button>'
    });

    // --- Task Trial ---
    var trial_procedure = {
        timeline: [
            { type: jsPsychImageButtonResponse, stimulus: 'stimulus/blank.png', stimulus_width: 1, choices: ['S', 'H'], button_html: '<button class="jspsych-btn response-button" style="visibility:hidden">%choice%</button>', trial_duration: 500, response_ends_trial: false },
            {
                type: jsPsychImageButtonResponse,
                stimulus: jsPsych.timelineVariable('file_path_mixed'),
                choices: ['S', 'H'],
                button_html: '<button class="jspsych-btn response-button">%choice%</button>',
                trial_duration: 4000,
                data: function() { return jsPsych.timelineVariable('data'); },
                on_finish: function(data) {
                    // response 0,1 を "1","2" に変換
                    var mapped_resp = (data.response === 0) ? "1" : "2"; 
                    data.response_value = mapped_resp; 
                    
                    // 正誤判定
                    data.is_correct = (mapped_resp == data.correct_answer) ? 1 : 0;
                    if (data.is_correct === 0) data.feedback = 'X';
                }
            },
            { type: jsPsychImageButtonResponse, stimulus: 'stimulus/blank.png', stimulus_width: 1, choices: ['S', 'H'], button_html: '<button class="jspsych-btn response-button" style="visibility:hidden">%choice%</button>', trial_duration: 200, response_ends_trial: false, 
              prompt: function() { 
                  var last = jsPsych.data.get().last(1).values()[0];
                  return '<p class="feedback-text">' + (last.feedback || '') + '</p>'; 
              } 
            }
        ],
        timeline_variables: timeline_variables
    };
    timeline.push(trial_procedure);

    // --- Final Results (Batch Data Cleaning & Analysis) ---
    var final_screen = {
        type: jsPsychHtmlButtonResponse,
        stimulus: function() {
            // バッファから全回答試行を取得
            var trials = jsPsych.data.get().filter({task: 'response'}).values();
            
            var repeat_rts = [];
            var switch_rts = [];
            var total_correct = 0;

            // 1. 全試行をループしてラベルとフラグを付与
            for (var i = 0; i < trials.length; i++) {
                var curr = trials[i];
                var stim_num = parseInt(curr.stimulus_number_mixed);
                
                // 現在の試行がどっちのセットか判定 (1-4=Global, 5-8=Local)
                var curr_set = (stim_num <= 4) ? "Global" : "Local";
                curr.analysis_set = curr_set;

                if (i === 0) {
                    // 初回試行は比較対象がないので Warmup
                    curr.analysis_label = "Warmup";
                    curr.calculation_inclusion = 0;
                } else {
                    var prev = trials[i-1];
                    var prev_set = (parseInt(prev.stimulus_number_mixed) <= 4) ? "Global" : "Local";
                    
                    // Switch / Repeat の判定
                    var label = (curr_set === prev_set) ? "Repeat" : "Switch";
                    curr.analysis_label = label;

                    // ★ 計算採用フラグ (今回正解 ＆ 前回正解 ＆ 反応あり)
                    var inclusion = (curr.is_correct == 1 && prev.is_correct == 1 && curr.rt !== null) ? 1 : 0;
                    curr.calculation_inclusion = inclusion;

                    // 集計用配列へ追加
                    if (inclusion === 1) {
                        if (label === "Repeat") repeat_rts.push(curr.rt);
                        else if (label === "Switch") switch_rts.push(curr.rt);
                    }
                }
                if (curr.is_correct == 1) total_correct++;
            }

            // 2. 平均算出
            var calcAvg = function(arr) {
                if (arr.length === 0) return 0;
                var sum = 0;
                for(var j=0; j<arr.length; j++) { sum += arr[j]; }
                return Math.round(sum / arr.length);
            };

            var m_rep = calcAvg(repeat_rts);
            var m_swi = calcAvg(switch_rts);
            var cost = (m_swi > 0 && m_rep > 0) ? (m_swi - m_rep) : 0;

            // 3. HTML出力
            var out = '<div style="text-align:center;">';
            out += '<h1 style="color: #2ecc71;">Analysis Complete</h1>';
            out += '<p>Advanced Performance Summary:</p>';
            out += '<table id="result-table">';
            out += '<tr><td>Accuracy:</td><td>' + total_correct + ' / ' + trials.length + '</td></tr>';
            out += '<tr><td>Mean Repeat RT:</td><td>' + m_rep + ' ms</td></tr>';
            out += '<tr><td>Mean Switch RT:</td><td>' + m_swi + ' ms</td></tr>';
            out += '<tr><td style="color:#e67e22; font-weight:bold;">Switch Cost:</td><td style="color:#e67e22; font-weight:bold;">' + cost + ' ms</td></tr>';
            out += '</table>';
            out += '<p style="font-size:0.8rem; color:#999; margin-top:15px;">Analyzed ' + repeat_rts.length + ' Repeat & ' + switch_rts.length + ' Switch trials.<br>(Consecutive Correct responses only)</p>';
            out += '</div>';
            return out;
        },
        choices: ['Download Results (CSV)', 'Return to Portfolio'],
        button_html: '<button class="jspsych-btn result-btn">%choice%</button>',
        on_finish: function(data) {
            if (data.response === 0) {
                // ここでダウンロードされるCSVには、上記の分析ラベルやフラグが全て含まれます
                var csv = jsPsych.data.get().filter({task: 'response'}).csv();
                var blob = new Blob([csv], { type: 'text/csv' });
                var a = document.createElement('a');
                a.href = window.URL.createObjectURL(blob);
                a.download = 'local_global_cleaned_data.csv';
                a.click();
            } else {
                window.location.href = 'https://sites.google.com/view/ryojimiyata/home?authuser=0';
            }
        }
    };

    timeline.push({ timeline: [final_screen], loop_function: function(data){ return data.values()[0].response === 0; } });

    jsPsych.run(timeline);
}

// Helpers (CSV読み込み)
async function loadStimuliData() {
    try {
        var resp = await fetch('local_global_mixed.csv');
        var txt = await resp.text();
        var lines = txt.trim().replace(/^\uFEFF/, '').split('\n');
        // ヘッダーを正確に定義
        var heads = ['FrameType_mixed', 'stimulus_mixed', 'file_path_mixed', 'correct_answer_mixed', 'block_type_mixed', 'stimulus_number_mixed', 'congruency'];
        return lines.slice(1).map(function(l) {
            var v = l.split(',');
            var o = {};
            heads.forEach(function(h, i) { if (v[i]) o[heads[i]] = v[i].trim(); });
            return o;
        }).filter(function(v) { return v.file_path_mixed; });
    } catch (e) { return null; }
}

// Helpers (試行生成)
function createTimelineVariables(data) {
    var TOTAL = 40; var vars = []; var lastNum = null;
    var shuffle = function(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = arr[i]; arr[i] = arr[j]; arr[j] = temp;
        }
        return arr;
    };
    var types = Array(2).fill('warmup').concat(shuffle(Array(19).fill('switch').concat(Array(19).fill('repeat'))));
    for (var i = 0; i < TOTAL; i++) {
        var type = types[i];
        var possible = data;
        if (i >= 2) {
            var isLastLoc = ['1','2','3','4'].indexOf(lastNum) > -1;
            var target = (type === "switch") ? (isLastLoc ? ['5','6','7','8'] : ['1','2','3','4']) : (isLastLoc ? ['1','2','3','4'] : ['5','6','7','8']);
            possible = data.filter(function(s) { return target.indexOf(s.stimulus_number_mixed) > -1; });
        }
        var sel = possible[Math.floor(Math.random() * possible.length)] || data[0];
        lastNum = sel.stimulus_number_mixed;
        
        // 重要なメタデータをdataオブジェクトに入れておく
        vars.push({ 
            file_path_mixed: sel.file_path_mixed, 
            data: { 
                task: 'response', 
                correct_answer: sel.correct_answer_mixed,
                stimulus_number_mixed: sel.stimulus_number_mixed,
                congruency: sel.congruency
            } 
        });
    }
    return vars;
}


startExperiment();
